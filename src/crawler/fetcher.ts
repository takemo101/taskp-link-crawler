import { existsSync, mkdirSync, rmSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { PATHS, PATTERNS } from "../constants.js";
import { DependencyError, FetchError, TimeoutError } from "../errors.js";
import type { CrawlConfig, Fetcher, FetchResult } from "../types.js";
import type { RuntimeAdapter } from "../utils/runtime.js";
import { createRuntimeAdapter } from "../utils/runtime.js";

/** Playwright CLIのパスを検索する設定 */
export interface PlaywrightPathConfig {
	nodePaths: readonly string[];
	cliPaths: readonly string[];
}

/**
 * Playwright-CLI Fetcher (全サイト対応)
 *
 * ## playwright-cli 0.0.63+ 互換性について (2026-02-05)
 *
 * ### 問題1: Unixソケットパス長制限
 * playwright-cliはセッションごとにUnixソケットを作成する。
 * パスが `/var/folders/.../playwright-cli/<hash>/<sessionId>.sock` となり、
 * Unixの制限(~108文字)を超えるとEINVALエラーが発生。
 * → sessionIdを `crawl-${Date.now()}` から `c${Date.now().toString(36)}` に短縮
 *
 * ### 問題2: --session オプションの仕様変更
 * playwright-cli 0.0.63+ では、`--session=xxx` でセッション作成後、
 * 2回目以降のコマンドで同じ `--session=xxx` を使うと
 * "The session is already configured" エラーが発生する。
 * → デフォルトセッション(--session省略)を使用するよう変更
 *    - open, eval, network: --session オプションを削除
 *    - close: session-stop コマンドに変更
 */
export class PlaywrightFetcher implements Fetcher {
	private initialized = false;
	private isClosed = false;
	private nodePath: string = "node";
	private playwrightPath: string = "playwright-cli";
	private runtime: RuntimeAdapter;
	private pathConfig: PlaywrightPathConfig;

	constructor(
		private config: CrawlConfig,
		runtime?: RuntimeAdapter,
		pathConfig?: PlaywrightPathConfig,
		private logDebug?: (message: string, data?: unknown) => void,
	) {
		this.runtime = runtime ?? createRuntimeAdapter();
		this.pathConfig = pathConfig ?? {
			nodePaths: PATHS.NODE_PATHS,
			cliPaths: PATHS.PLAYWRIGHT_PATHS,
		};
	}

	/** Playwright CLIが利用可能かチェック */
	private async checkPlaywrightCli(): Promise<boolean> {
		for (const node of this.pathConfig.nodePaths) {
			for (const cli of this.pathConfig.cliPaths) {
				const result = await this.runtime.spawn(node, [cli, "--version"]);
				if (result.success) {
					this.nodePath = node;
					this.playwrightPath = cli;
					return true;
				}
			}
		}
		return false;
	}

	/** playwright-cliの作業ディレクトリ（outputDir を使用） */
	private get cliWorkDir(): string {
		return resolve(this.config.outputDir);
	}

	/** CLIコマンドを実行（cwdをoutputDirに設定） */
	private async runCli(
		args: string[],
	): Promise<{ success: boolean; stdout: string; stderr: string }> {
		// outputDirが存在しない場合は作成（playwright-cliが書き込めるように）
		const workDir = this.cliWorkDir;
		if (!existsSync(workDir)) {
			mkdirSync(workDir, { recursive: true });
		}
		return this.runtime.spawn(this.nodePath, [this.playwrightPath, ...args], workDir);
	}

	/**
	 * フェッチを実行
	 *
	 * Note: playwright-cli 0.0.63+ では名前付きセッション(--session=xxx)が
	 * 2回目以降のコマンドで使えないため、デフォルトセッションを使用。
	 * これにより並列クロールはできないが、通常の逐次クロールでは問題なし。
	 */
	private async executeFetch(url: string): Promise<FetchResult | null> {
		// 防御的チェック: http/httpsのみ許可
		try {
			const parsed = new URL(url);
			if (!["http:", "https:"].includes(parsed.protocol)) {
				return null;
			}
			// URL長の上限チェックを追加
			if (url.length > 2048) {
				return null;
			}
			// 制御文字のチェックを追加
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional check for control characters in URLs
			if (/[\x00-\x1f\x7f]/.test(url)) {
				return null;
			}
		} catch {
			// URL解析に失敗した場合もnullを返す
			return null;
		}

		// デフォルトセッションを使用（--session省略）
		const openArgs = ["open", url];
		if (this.config.headed) {
			openArgs.push("--headed");
		}

		// ページを開く
		const openResult = await this.runCli(openArgs);

		// 404等でページが開けない場合はnullを返してスキップ
		if (!openResult.success) {
			if (
				openResult.stderr.includes("ERR_HTTP_RESPONSE_CODE_FAILURE") ||
				openResult.stdout.includes("chrome-error://")
			) {
				return null;
			}
			throw new FetchError(`Failed to open page: ${openResult.stderr}`, url);
		}

		// エラーページにリダイレクトされた場合はスキップ
		if (
			openResult.stdout.includes("chrome-error://") ||
			openResult.stdout.includes("Page URL: chrome-error://")
		) {
			return null;
		}

		// HTTPメタデータ（ステータスコード・content-type）を取得
		const { statusCode, contentType } = await this.getHttpMetadata();
		if (statusCode !== null && (statusCode < 200 || statusCode >= 300)) {
			// 2xx範囲外はスキップ
			return null;
		}

		// レンダリング待機
		await this.runtime.sleep(this.config.spaWait);

		// リダイレクト後のURLを取得
		const urlResult = await this.runCli(["eval", "window.location.href"]);
		const finalUrl = urlResult.success ? parseCliOutput(urlResult.stdout).trim() : url;

		// コンテンツ取得
		const result = await this.runCli(["eval", "document.documentElement.outerHTML"]);
		if (!result.success) {
			throw new FetchError(`Failed to get content: ${result.stderr}`, url);
		}

		const html = parseCliOutput(result.stdout);

		return {
			html,
			finalUrl,
			contentType,
		};
	}

	/** HTTPメタデータ（ステータスコード・content-type）を取得 */
	private async getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }> {
		try {
			const networkResult = await this.runCli(["network"]);
			if (!networkResult.success) {
				return { statusCode: null, contentType: "text/html" };
			}

			// networkログファイルのパスを抽出
			const logMatch = networkResult.stdout.match(/\[Network\]\(([^)]+)\)/);
			if (logMatch) {
				// 相対パスから絶対パスを構築
				const logPath = normalize(logMatch[1]);

				// パストラバーサル防止: outputDirの外を参照していないことを確認
				const baseDir = this.cliWorkDir;

				// 絶対パスの場合は直接使用、相対パスの場合はoutputDirと結合
				const fullPath = isAbsolute(logPath) ? logPath : join(baseDir, logPath);
				const resolvedPath = resolve(fullPath);
				const resolvedCwd = resolve(baseDir);

				// 解決済みパスがcwd配下にあることを確認
				if (!resolvedPath.startsWith(resolvedCwd + sep) && resolvedPath !== resolvedCwd) {
					return { statusCode: null, contentType: "text/html" };
				}

				if (existsSync(fullPath)) {
					const logContent = await this.runtime.readFile(fullPath);

					// ステータスコード抽出
					const statusMatch = logContent.match(/status:\s*(\d+)/);
					const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;

					// content-type 抽出（大文字小文字を区別しない、セミコロン以降は除外）
					const contentTypeMatch = logContent.match(/content-type:\s*([^\n\r;]+)/i);
					const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : "text/html";

					return { statusCode, contentType };
				}
			}
			return { statusCode: null, contentType: "text/html" };
		} catch {
			return { statusCode: null, contentType: "text/html" };
		}
	}

	async fetch(url: string): Promise<FetchResult | null> {
		if (!this.initialized) {
			const hasPlaywright = await this.checkPlaywrightCli();
			if (!hasPlaywright) {
				throw new DependencyError(
					"playwright-cli not found. Install with: npm install -g @playwright/cli",
					"playwright-cli",
				);
			}
			this.initialized = true;
		}

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			// タイムアウト用のPromiseを作成
			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(
						new TimeoutError(
							`Request timeout after ${this.config.timeout / 1000}s (${this.config.timeout}ms)`,
							this.config.timeout,
						),
					);
				}, this.config.timeout);
			});

			// fetchとタイムアウトを競争させる
			const result = await Promise.race([this.executeFetch(url), timeoutPromise]);
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
			return result;
		} catch (error) {
			// エラー時もタイマーをクリア
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}

			// タイムアウトエラーの場合はセッションをクリーンアップ
			if (error instanceof TimeoutError) {
				try {
					await this.runCli(["session-stop"]);
				} catch (cleanupError) {
					// クリーンアップエラーは無視（セッションが既に閉じている可能性）
					this.logDebug?.(`session-stop on timeout failed: ${cleanupError}`);
				}
			}

			if (error instanceof FetchError || error instanceof TimeoutError) {
				throw error;
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new FetchError(message, url, error);
		}
	}

	async close(): Promise<void> {
		// Idempotency guard: prevent double close
		if (this.isClosed) {
			this.logDebug?.("close() called but already closed (skipping)");
			return;
		}
		this.isClosed = true;

		try {
			// デフォルトセッションを停止
			// Note: 以前は ["close", "--session", sessionId] だったが、
			// playwright-cli 0.0.63+ では session-stop コマンドを使用
			await this.runCli(["session-stop"]);
		} catch (error) {
			// セッションが既に閉じている場合は無視（デバッグログのみ）
			this.logDebug?.(`session-stop failed (expected if already closed): ${error}`);
		}

		// .playwright-cli ディレクトリをクリーンアップ（outputDir内）
		if (!this.config.keepSession) {
			try {
				const cliDir = join(this.cliWorkDir, ".playwright-cli");
				if (existsSync(cliDir)) {
					rmSync(cliDir, { recursive: true, force: true });
				}
			} catch (error) {
				// クリーンアップ失敗は無視（デバッグログのみ）
				this.logDebug?.(".playwright-cli cleanup failed", { error: String(error) });
			}
		}
	}
}

/**
 * playwright-cli の出力からHTMLを抽出
 * @param output CLI出力文字列
 * @returns 抽出されたHTML
 */
export function parseCliOutput(output: string): string {
	// 出力形式: ### Result\n"<html>..."\n### Ran Playwright code...
	const resultMatch = output.match(PATTERNS.CLI_RESULT);
	if (resultMatch) {
		// JSON文字列としてパース（エスケープを解除）
		try {
			return JSON.parse(`"${resultMatch[1]}"`);
		} catch {
			// パース失敗時はエスケープを手動で解除
			return resultMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
		}
	}
	// フォールバック: そのまま返す
	return output;
}
