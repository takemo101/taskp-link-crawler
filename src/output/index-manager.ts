import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILENAME } from "../constants.js";
import type { CrawledPage, CrawlResult, Logger, PageMetadata } from "../types.js";

/**
 * CrawlResult型の型ガード関数
 * @param value 検証する値
 * @returns valueがCrawlResult型であればtrue
 */
function isValidCrawlResult(value: unknown): value is CrawlResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"pages" in value &&
		Array.isArray((value as Record<string, unknown>).pages)
	);
}

/**
 * インデックス管理クラス
 * index.jsonの読み込み・保存・管理を担当
 */
export class IndexManager {
	private result: CrawlResult;
	/** 既存のページ情報（URL→CrawledPage） */
	private existingPages: Map<string, CrawledPage> = new Map();
	private pageCount = 0;
	/** 訪問済みURL（差分クロール時のマージ範囲制限用） */
	private visitedUrls: Set<string> | null = null;
	/** マージ済みフラグ（saveIndex複数回呼び出し対策） */
	private mergedAlready = false;

	constructor(
		private outputDir: string,
		private baseUrl: string,
		private config: { maxDepth: number; sameDomain: boolean; diff?: boolean },
		private logger?: Logger,
	) {
		// 既存のindex.jsonを読み込み
		this.loadExistingIndex();

		this.result = {
			crawledAt: new Date().toISOString(),
			baseUrl: this.baseUrl,
			config: {
				maxDepth: this.config.maxDepth,
				sameDomain: this.config.sameDomain,
			},
			totalPages: 0,
			pages: [],
			specs: [],
		};
	}

	/**
	 * 既存のindex.jsonを読み込む
	 */
	private loadExistingIndex(): void {
		const indexPath = join(this.outputDir, FILENAME.INDEX_JSON);
		if (!existsSync(indexPath)) {
			return;
		}

		try {
			const content = readFileSync(indexPath, "utf-8");
			const parsed = JSON.parse(content);

			// 型ガードによる検証
			if (isValidCrawlResult(parsed)) {
				for (const page of parsed.pages) {
					this.existingPages.set(page.url, page);
				}
			} else {
				this.logger?.logIndexFormatError(indexPath);
			}
		} catch (error) {
			this.logger?.logIndexLoadError(error instanceof Error ? error.message : String(error));
		}
	}

	/**
	 * 既存の全ハッシュを取得
	 * @returns URL → ハッシュのMap
	 */
	getExistingHashes(): Map<string, string> {
		const hashes = new Map<string, string>();
		for (const [url, page] of this.existingPages) {
			if (page.hash) {
				hashes.set(url, page.hash);
			}
		}
		return hashes;
	}

	/**
	 * 次のページ番号を取得
	 */
	getNextPageNumber(): number {
		return this.pageCount + 1;
	}

	/**
	 * ページを登録（インデックスに追加）
	 * @returns 登録されたページ情報
	 */
	registerPage(
		url: string,
		file: string,
		depth: number,
		links: string[],
		metadata: PageMetadata,
		title: string | null,
		hash: string,
	): CrawledPage {
		this.pageCount++;
		const pageCrawledAt = new Date().toISOString();
		const page: CrawledPage = {
			url,
			title: metadata.title || title,
			file,
			depth,
			links,
			metadata,
			hash,
			crawledAt: pageCrawledAt,
		};
		this.result.pages.push(page);
		return page;
	}

	/**
	 * 仕様ファイルを追加
	 */
	addSpec(url: string, type: string, file: string): void {
		this.result.specs.push({ url, type, file });
	}

	/**
	 * 訪問済みURLを設定（差分クロール時のマージ範囲制限用）
	 * @param urls 訪問済みURLのSet
	 */
	setVisitedUrls(urls: Set<string>): void {
		this.visitedUrls = urls;
	}

	/**
	 * 既存のページ情報を結果にマージ
	 * 差分クロール時、スキップされたページの情報を保持するために使用
	 * べき等性を保証（複数回呼ばれても安全）
	 */
	private mergeExistingPages(): void {
		// 既にマージ済みの場合は何もしない（べき等性保証）
		if (this.mergedAlready) return;
		this.mergedAlready = true;

		// O(1)の重複チェックのためSetを使用
		const registeredUrls = new Set(this.result.pages.map((p) => p.url));

		for (const [url, page] of this.existingPages) {
			// 既に登録済みのページはスキップ
			if (registeredUrls.has(url)) {
				continue;
			}

			// 訪問済みURLリストが設定されている場合、
			// 訪問されたページのみマージ（削除されたページは除外）
			if (this.visitedUrls && !this.visitedUrls.has(url)) {
				continue;
			}

			this.result.pages.push(page);
		}
	}

	/**
	 * インデックスを保存
	 * @returns 保存したファイルパス
	 */
	saveIndex(): string {
		// 差分モード時は既存ページをマージ
		if (this.config.diff) {
			this.mergeExistingPages();
		}

		// totalPages を pages.length から算出
		this.result.totalPages = this.result.pages.length;

		const indexPath = join(this.outputDir, FILENAME.INDEX_JSON);
		writeFileSync(indexPath, JSON.stringify(this.result, null, 2));
		return indexPath;
	}

	/**
	 * 結果を取得
	 */
	getResult(): CrawlResult {
		// totalPages を pages.length と同期
		this.result.totalPages = this.result.pages.length;
		return this.result;
	}
}
