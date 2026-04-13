import type { CrawlConfig, Logger } from "../types.js";

/**
 * クロールログ出力クラス
 * ログ出力の責務を分離
 */
export class CrawlLogger implements Logger {
	private skippedCount = 0;
	private debug: boolean;

	constructor(
		private config: CrawlConfig,
		debug?: boolean,
	) {
		this.debug = debug ?? process.env.DEBUG === "1";
	}

	/** クロール開始ログ */
	logStart(): void {
		console.log(`\n🕷️  Link Crawler v${this.config.version}`);
		console.log(`   URL: ${this.config.startUrl}`);
		console.log(`   Depth: ${this.config.maxDepth}`);
		if (this.config.maxPages !== null) {
			console.log(`   Max pages: ${this.config.maxPages}`);
		}
		console.log(`   Output: ${this.config.outputDir}`);
		console.log(
			`   Mode: ${this.config.fetcherType === "native" ? "playwright-native" : "playwright-cli"}`,
		);
		console.log(`   Same domain only: ${this.config.sameDomain}`);
		console.log(`   Diff mode: ${this.config.diff}`);
		console.log(`   Pages: ${this.config.pages ? "yes" : "no"}`);
		console.log(`   Merge: ${this.config.merge ? "yes" : "no"}`);
		console.log(`   Chunks: ${this.config.chunks ? "yes" : "no"}`);
		console.log(`   Robots.txt: ${this.config.respectRobots ? "respect" : "ignore"}`);
		if (this.debug) {
			console.log(`   Debug: enabled`);
		}
		console.log("");
	}

	/** 既存ハッシュ読み込みログ */
	logLoadedHashes(count: number): void {
		if (count > 0) {
			console.log(`📊 Loaded ${count} existing page hashes\n`);
		}
	}

	/** index.json形式エラーログ */
	logIndexFormatError(indexPath: string): void {
		console.warn(`[WARN] Invalid index.json format at ${indexPath}`);
	}

	/** index.json読み込みエラーログ（詳細付き） */
	logIndexLoadError(error: string): void {
		console.warn(`[WARN] Failed to load index.json: ${error}`);
	}

	/** ページクロール開始ログ */
	logCrawlStart(url: string, depth: number): void {
		const indent = "  ".repeat(depth);
		console.log(`${indent}→ [${depth}] ${url}`);
	}

	/** ページ保存ログ */
	logPageSaved(file: string, depth: number, linkCount: number, cached = false): void {
		const indent = "  ".repeat(depth);
		const action = cached ? "Cached" : "Saved";
		console.log(`${indent}  ✓ ${action}: ${file} (${linkCount} links found)`);
	}

	/** スキップログ（差分検出時） */
	logSkipped(depth: number): void {
		const indent = "  ".repeat(depth);
		console.log(`${indent}  ⏭️  Skipped (unchanged)`);
		this.skippedCount++;
	}

	/** 最大ページ数到達ログ */
	logMaxPagesReached(limit: number): void {
		console.log(`\n⚠️  Max pages limit reached (${limit})`);
	}

	/** 仕様ファイル検出ログ */
	logSpecDetected(type: string, filename: string): void {
		console.log(`  📋 Spec: ${type} - ${filename}`);
	}

	/** フェッチエラーログ */
	logFetchError(url: string, error: string, depth: number): void {
		const indent = "  ".repeat(depth);
		console.error(`${indent}  ✗ Fetch Error: ${error} - ${url}`);
	}

	/** Cloudflare チャレンジページ検出ログ */
	logCloudflareChallenge(url: string, depth: number): void {
		const indent = "  ".repeat(depth);
		console.warn(`${indent}  ⚠️  Cloudflare challenge page detected, skipping: ${url}`);
		console.warn(`${indent}     Tip: retry with a longer --wait (e.g. --wait 12000)`);
	}

	/** 後処理開始ログ */
	logPostProcessingStart(): void {
		console.log("\n🔄 Running Post-processing...");
	}

	/** 後処理スキップログ */
	logPostProcessingSkipped(): void {
		console.log("\n⚠️  No pages to process");
	}

	/** Merger開始ログ */
	logMergerStart(): void {
		console.log("\n🔄 Running Merger...");
	}

	/** Merger完了ログ */
	logMergerComplete(path: string): void {
		console.log(`   ✓ full.md: ${path}`);
	}

	/** Chunker開始ログ */
	logChunkerStart(): void {
		console.log("\n🔄 Running Chunker...");
	}

	/** Chunker完了ログ */
	logChunkerComplete(count: number): void {
		if (count > 0) {
			console.log(`   ✓ chunks: ${count} files in chunks/`);
		} else {
			console.log("   ℹ️  No chunks created (content too small)");
		}
	}

	/** クロール完了ログ */
	logComplete(totalPages: number, specsCount: number, indexPath: string): void {
		console.log(`\n✅ Crawl complete!`);
		console.log(`   Pages: ${totalPages}`);
		if (this.config.diff && this.skippedCount > 0) {
			console.log(`   Skipped (unchanged): ${this.skippedCount}`);
		}
		console.log(`   Specs: ${specsCount}`);
		console.log(`   Index: ${indexPath}`);
	}

	/** 警告ログ */
	logWarning(message: string): void {
		console.warn(`⚠️  ${message}`);
	}

	/** デバッグログ（DEBUG=1時のみ） */
	logDebug(message: string, data?: unknown): void {
		if (this.debug) {
			const timestamp = new Date().toISOString();
			console.log(`[DEBUG ${timestamp}] ${message}`);
			if (data !== undefined) {
				console.log(JSON.stringify(data, null, 2));
			}
		}
	}
}
