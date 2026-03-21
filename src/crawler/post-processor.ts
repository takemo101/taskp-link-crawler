import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILENAME } from "../constants.js";
import { Chunker } from "../output/chunker.js";
import { Merger } from "../output/merger.js";
import type { CrawlConfig, CrawledPage } from "../types.js";
import { CrawlLogger } from "./logger.js";

/**
 * 後処理クラス
 * MergerとChunkerの呼び出しを担当
 */
export class PostProcessor {
	private logger: CrawlLogger;

	constructor(
		private config: CrawlConfig,
		private outputDir: string,
		logger?: CrawlLogger,
	) {
		this.logger = logger ?? new CrawlLogger(config);
	}

	/**
	 * 後処理を実行
	 * @param pages クロール済みページ一覧
	 * @param pageContents ページ内容のMap (--no-pages時に使用)
	 */
	process(pages: CrawledPage[], pageContents?: Map<string, string>): void {
		if (pages.length === 0) {
			this.logger.logPostProcessingSkipped();
			return;
		}

		this.logger.logPostProcessingStart();

		// ページ内容を読み込む (--no-pages時はメモリから取得)
		const contents = this.config.pages
			? this.loadPageContentsFromDisk(pages)
			: (pageContents ?? new Map<string, string>());

		// コンテンツ結合が必要かどうかを明示的に判定
		// - merge: full.md出力のため
		// - chunks: チャンク分割のため
		const needsFullContent = this.config.merge || this.config.chunks;
		let fullMdContent = "";

		if (needsFullContent) {
			// Merger を必要時のみ生成
			const merger = new Merger(this.logger);
			fullMdContent = merger.buildFullContent(pages, contents);
		}

		// Merger出力 (full.md書き込み)
		if (this.config.merge && fullMdContent) {
			this.logger.logMergerStart();
			const outputPath = join(this.outputDir, FILENAME.FULL_MD);
			writeFileSync(outputPath, fullMdContent);
			this.logger.logMergerComplete(outputPath);
		}

		// Chunker出力
		if (this.config.chunks && fullMdContent) {
			this.logger.logChunkerStart();
			// Chunker を必要時のみ生成
			const chunker = new Chunker(this.outputDir);
			const chunkFiles = chunker.chunkAndWrite(fullMdContent);
			this.logger.logChunkerComplete(chunkFiles.length);
		}
	}

	/**
	 * ページ内容をディスクから読み込む
	 * @param pages クロール済みページ一覧
	 * @returns ページ内容のMap
	 */
	private loadPageContentsFromDisk(pages: CrawledPage[]): Map<string, string> {
		const contents = new Map<string, string>();

		for (const page of pages) {
			try {
				const pagePath = join(this.outputDir, page.file);
				const content = readFileSync(pagePath, "utf-8");
				contents.set(page.file, content);
			} catch (error) {
				// ファイルが読み込めない場合は空文字（デバッグログのみ）
				this.logger.logDebug("Failed to read page file", {
					file: page.file,
					error: String(error),
				});
				contents.set(page.file, "");
			}
		}

		return contents;
	}
}
