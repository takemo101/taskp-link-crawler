import { type Browser, chromium } from "playwright";
import { FetchError, TimeoutError } from "../errors.js";
import type { CrawlConfig, Fetcher, FetchResult } from "../types.js";

/** browser.close() の最大待機時間 */
const BROWSER_CLOSE_TIMEOUT_MS = 5_000;

/**
 * Bot 検出を回避するための User-Agent
 * Cloudflare 等のボット検出は UA を確認するため Chrome に偽装する
 */
const ANTI_BOT_USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Playwright Native Fetcher
 *
 * playwright を直接使用し、Bot 検出を回避する。
 * Cloudflare 等で保護されたサイト（Notion 等）向け。
 *
 * ## playwright-cli fetcher との違い
 * | 項目                        | cli fetcher    | native fetcher             |
 * |-----------------------------|----------------|----------------------------|
 * | headless                    | true           | true（新 HL モード）       |
 * | AutomationControlled 無効化 | ❌             | ✅                         |
 * | navigator.webdriver 削除    | ❌             | ✅ initScript              |
 * | User-Agent 偽装             | ❌             | ✅ Chrome 131              |
 * | コンテンツ待機              | 固定 sleep     | networkidle                |
 * | ブラウザインスタンス        | セッション共有 | 1つを使い回し(コンテキスト分離) |
 *
 * ## 単一ブラウザインスタンスを使う理由
 * Bun + Playwright の組み合わせで、短時間に Chromium を複数回起動すると
 * 2回目以降でブラウザとの CDP 通信がハングする問題がある。
 * 1つのブラウザインスタンスを使い回し、URL ごとに新しい BrowserContext を
 * 作成することで、分離性を保ちつつハングを回避する。
 */
export class PlaywrightNativeFetcher implements Fetcher {
	private browserPromise: Promise<Browser> | null = null;

	constructor(
		private config: CrawlConfig,
		private logDebug?: (message: string, data?: unknown) => void,
	) {}

	/** ブラウザの遅延初期化（Promise を共有して競合を防ぐ） */
	private getBrowser(): Promise<Browser> {
		if (!this.browserPromise) {
			this.logDebug?.("Launching shared browser instance");
			this.browserPromise = chromium
				.launch({
					headless: true,
					args: [
						"--disable-blink-features=AutomationControlled",
						"--no-sandbox",
						"--disable-setuid-sandbox",
						"--disable-dev-shm-usage",
						"--disable-accelerated-2d-canvas",
						"--no-first-run",
						"--no-zygote",
					],
				})
				.then((browser) => {
					// ブラウザ切断時に参照をクリアし、次回呼び出しで再起動させる
					browser.on("disconnected", () => {
						this.logDebug?.("Browser disconnected, will re-launch on next fetch");
						this.browserPromise = null;
					});
					return browser;
				});
		}
		return this.browserPromise;
	}

	async fetch(url: string): Promise<FetchResult | null> {
		// URLバリデーション
		try {
			const parsed = new URL(url);
			if (!["http:", "https:"].includes(parsed.protocol)) return null;
			if (url.length > 2048) return null;
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional check for control characters in URLs
			if (/[\x00-\x1f\x7f]/.test(url)) return null;
		} catch {
			return null;
		}

		const browser = await this.getBrowser();
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(
						new TimeoutError(
							`Request timeout after ${this.config.timeout / 1000}s`,
							this.config.timeout,
						),
					);
				}, this.config.timeout);
			});

			const fetchPromise = this.executeFetch(browser, url);
			const result = await Promise.race([fetchPromise, timeoutPromise]);

			if (timeoutId !== undefined) clearTimeout(timeoutId);
			return result;
		} catch (error) {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
			if (error instanceof TimeoutError || error instanceof FetchError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new FetchError(message, url, error);
		}
	}

	/** フェッチ実行本体 */
	private async executeFetch(browser: Browser, url: string): Promise<FetchResult | null> {
		this.logDebug?.(`Fetching: ${url}`);
		// URL ごとに新しいコンテキストで分離（Cookie, ストレージ等を共有しない）
		const context = await browser.newContext({
			userAgent: ANTI_BOT_USER_AGENT,
			viewport: { width: 1920, height: 1080 },
		});

		try {
			const page = await context.newPage();

			// navigator.webdriver を undefined に偽装（Cloudflare Bot 検出回避）
			await page.addInitScript(() => {
				Object.defineProperty(navigator, "webdriver", {
					get: () => undefined,
				});
			});

			// ページに移動し、レスポンス情報を取得
			let response: Awaited<ReturnType<typeof page.goto>>;
			try {
				response = await page.goto(url, {
					waitUntil: "domcontentloaded",
					timeout: this.config.timeout,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message.includes("ERR_HTTP_RESPONSE_CODE_FAILURE") || message.includes("net::ERR_")) {
					return null;
				}
				throw new FetchError(message, url, error);
			}

			// 最終レスポンスのステータスコードと content-type を取得
			const statusCode = response?.status() ?? null;
			const contentType = response?.headers()["content-type"]?.split(";")[0].trim() ?? "text/html";

			// 2xx 以外はスキップ
			if (statusCode !== null && (statusCode < 200 || statusCode >= 300)) {
				return null;
			}

			// コンテンツ待機: networkidle を待つ。タイムアウト時はフォールバック待機。
			try {
				await page.waitForLoadState("networkidle", { timeout: this.config.spaWait });
				this.logDebug?.("networkidle reached");
			} catch {
				// networkidle で spaWait 分待った後なので、追加待機は短めにする
				const fallbackWait = Math.min(this.config.spaWait, 3000);
				this.logDebug?.(`networkidle timeout, falling back to fixed wait (${fallbackWait}ms)`);
				await page.waitForTimeout(fallbackWait);
			}

			const finalUrl = page.url();
			// ブラウザ側で <script> / <style> を除去してから HTML を取得する。
			// Notion 等は JS バンドルを大量に含むため、除去することで
			// IPC 転送量と JSDOM 処理コストを大幅に削減できる。
			const html = await page.evaluate(() => {
				for (const el of document.querySelectorAll("script, style")) {
					el.remove();
				}
				return document.documentElement.outerHTML;
			});

			this.logDebug?.("Page fetched via playwright-native", {
				url,
				finalUrl,
				contentType,
				htmlLength: html.length,
			});

			return { html, finalUrl, contentType };
		} finally {
			try {
				await context.close();
			} catch {
				// context.close() 失敗は無視（ブラウザ切断時等）
			}
		}
	}

	async close(): Promise<void> {
		if (!this.browserPromise) return;
		try {
			const browser = await this.browserPromise;
			await closeBrowserWithTimeout(browser, BROWSER_CLOSE_TIMEOUT_MS, this.logDebug);
		} catch {
			// 起動失敗時は無視
		}
		this.browserPromise = null;
	}
}

/** browser.close() をタイムアウト付きで実行。ハングした場合はプロセスを強制終了する */
async function closeBrowserWithTimeout(
	browser: Browser,
	timeoutMs: number,
	logDebug?: (message: string, data?: unknown) => void,
): Promise<void> {
	try {
		await Promise.race([
			browser.close(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`browser.close() timed out after ${timeoutMs}ms`)),
					timeoutMs,
				),
			),
		]);
	} catch (error) {
		logDebug?.("browser.close() failed or timed out, force-killing", {
			error: String(error),
		});
		try {
			const proc = (browser as unknown as { process?: () => { pid?: number } }).process?.();
			if (proc?.pid) {
				process.kill(proc.pid, "SIGKILL");
				logDebug?.("Browser process killed", { pid: proc.pid });
			}
		} catch {
			// ベストエフォート
		}
	}
}
