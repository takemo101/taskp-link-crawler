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
 * | 項目                        | cli fetcher    | native fetcher        |
 * |-----------------------------|----------------|-----------------------|
 * | headless                    | true           | true（新 HL モード）  |
 * | AutomationControlled 無効化 | ❌             | ✅                    |
 * | navigator.webdriver 削除    | ❌             | ✅ initScript         |
 * | User-Agent 偽装             | ❌             | ✅ Chrome 131         |
 * | コンテンツ待機              | 固定 sleep     | networkidle           |
 * | ブラウザインスタンス        | セッション共有 | URL ごとに新規        |
 *
 * ## headless: true を使う理由
 * headless: false はサブプロセス環境（taskp 等）でウィンドウサーバーに
 * アクセスできずクラッシュする場合がある。
 * Playwright v1.22+ の headless: true は Chrome の新しいヘッドレス実装
 * (--headless=new) を使用しており、旧来の headless より検出されにくい。
 * AutomationControlled 無効化・webdriver 偽装・UA 偽装と組み合わせることで
 * Cloudflare 等のボット検出を回避できる。
 */
export class PlaywrightNativeFetcher implements Fetcher {
	constructor(
		private config: CrawlConfig,
		private logDebug?: (message: string, data?: unknown) => void,
	) {}

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

		// URL ごとに新規ブラウザインスタンスを使用（Bot 検出回避）
		// headless: true — Playwright v1.22+ の新 HL モード。サブプロセスでも安定動作。
		const browser = await chromium.launch({
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
		});

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
		} finally {
			await closeBrowserWithTimeout(browser, BROWSER_CLOSE_TIMEOUT_MS, this.logDebug);
		}
	}

	/** フェッチ実行本体 */
	private async executeFetch(browser: Browser, url: string): Promise<FetchResult | null> {
		this.logDebug?.(`Launching browser for: ${url}`);
		const context = await browser.newContext({
			userAgent: ANTI_BOT_USER_AGENT,
			viewport: { width: 1920, height: 1080 },
		});

		const page = await context.newPage();

		// navigator.webdriver を undefined に偽装（Cloudflare Bot 検出回避）
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", {
				get: () => undefined,
			});
		});

		// ページに移動し、レスポンス情報を取得
		// page.goto() の戻り値（メインフレームの最終レスポンス）を使うことで、
		// リダイレクト中間の 3xx を誤ってステータスとして拾うのを防ぐ
		let response: Awaited<ReturnType<typeof page.goto>>;
		try {
			response = await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: this.config.timeout,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// ERR_HTTP_RESPONSE_CODE_FAILURE 等は null を返してスキップ
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

		// コンテンツ待機:
		//   networkidle: API レスポンスや動的レンダリングが完了するまで待つ（React/Vue/Notion 等のSPA向け）
		//   タイムアウト時は短い追加待機のみ（spaWait はすでに消費済みなので再度フル待機しない）
		try {
			await page.waitForLoadState("networkidle", { timeout: this.config.spaWait });
			this.logDebug?.("networkidle reached");
		} catch {
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
	}

	async close(): Promise<void> {
		// 各 fetch() 内で browser.close() を呼んでいるため不要
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
			// BrowserType.launch() が返す Browser は内部的に BrowserServer を持つが、
			// 型定義には process() がないため any 経由でアクセスする
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
