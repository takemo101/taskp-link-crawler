import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FILENAME, SPEC_PATTERNS } from "../constants.js";
import { computeHash } from "../diff/index.js";
import type { CrawlConfig, CrawledPage, Logger, PageMetadata } from "../types.js";
import { IndexManager } from "./index-manager.js";

/** 文字列をslug形式に変換（小文字化、スペース→ハイフン、特殊文字除去） */
function slugify(text: string | null | undefined, maxLength = 50): string {
	if (!text || text.trim().length === 0) {
		return "";
	}

	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s_-]/g, "") // ASCII英数字・スペース・アンダースコア・ハイフン以外を除去
		.replace(/[\s_]+/g, "-") // スペースとアンダースコアをハイフンに
		.replace(/-+/g, "-") // 連続するハイフンを1つに
		.replace(/^-+|-+$/g, "") // 先頭・末尾のハイフンを除去
		.slice(0, maxLength) // 長さ制限
		.replace(/-+$/, ""); // 切り詰め後の末尾ハイフンを除去
}

/** URLパスからslugを生成（フォールバック用） */
function slugifyFromUrl(url: string, maxLength = 50): string {
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;

		// パスの最後のセグメントを取得（空文字列は除外）
		const segments = pathname.split("/").filter(Boolean);
		const lastSegment = segments[segments.length - 1] || "";

		// 拡張子を除去
		const withoutExt = lastSegment.replace(/\.[^.]+$/, "");

		// slugify処理
		return slugify(withoutExt, maxLength);
	} catch {
		return "";
	}
}

/** ファイル書き込みクラス */
export class OutputWriter {
	private indexManager: IndexManager;
	private tempOutputDir: string | null = null;
	private finalOutputDir: string;
	private workingOutputDir: string;

	constructor(
		config: CrawlConfig,
		private logger?: Logger,
	) {
		this.finalOutputDir = config.outputDir;

		// 非diffモード: 一時ディレクトリを使用して原子性を確保
		if (!config.diff) {
			this.tempOutputDir = `${config.outputDir}.tmp-${Date.now()}-${process.pid}`;
			this.workingOutputDir = this.tempOutputDir;
		} else {
			this.workingOutputDir = config.outputDir;
		}

		this.indexManager = new IndexManager(
			this.workingOutputDir,
			config.startUrl,
			{
				maxDepth: config.maxDepth,
				sameDomain: config.sameDomain,
				diff: config.diff,
			},
			this.logger,
		);

		// ディレクトリを作成（diffモードでは既存ファイルを保持、非diffモードは一時ディレクトリなので新規作成）
		const pagesDir = join(this.workingOutputDir, FILENAME.PAGES_DIR);
		const specsDir = join(this.workingOutputDir, FILENAME.SPECS_DIR);

		mkdirSync(pagesDir, { recursive: true });
		mkdirSync(specsDir, { recursive: true });
	}

	/** API仕様ファイルを検出・保存 */
	handleSpec(url: string, content: string): { type: string; filename: string } | null {
		for (const [type, pattern] of Object.entries(SPEC_PATTERNS)) {
			if (pattern.test(url)) {
				const filename = url.split("/").pop() || "spec";
				const specPath = join(this.workingOutputDir, FILENAME.SPECS_DIR, filename);
				mkdirSync(dirname(specPath), { recursive: true });
				writeFileSync(specPath, content);

				const file = `${FILENAME.SPECS_DIR}/${filename}`;
				this.indexManager.addSpec(url, type, file);
				return { type, filename };
			}
		}
		return null;
	}

	/** 次のページ番号を取得 */
	getNextPageNumber(): number {
		return this.indexManager.getNextPageNumber();
	}

	/** ページファイル名を生成 (public: Crawler の --no-pages モードで使用) */
	buildPageFilename(url: string, metadata: PageMetadata, title: string | null): string {
		const pageNum = String(this.getNextPageNumber()).padStart(FILENAME.PAGE_PAD_LENGTH, "0");
		const pageTitle = metadata.title || title;
		let titleSlug = slugify(pageTitle);

		// titleSlugが空の場合、URLパスからslugを生成
		if (!titleSlug && url) {
			titleSlug = slugifyFromUrl(url);
		}

		return titleSlug
			? `${FILENAME.PAGES_DIR}/${FILENAME.PAGE_PREFIX}${pageNum}-${titleSlug}.md`
			: `${FILENAME.PAGES_DIR}/${FILENAME.PAGE_PREFIX}${pageNum}.md`;
	}

	/** ページを登録（インデックスに追加） */
	registerPage(
		url: string,
		file: string,
		depth: number,
		links: string[],
		metadata: PageMetadata,
		title: string | null,
		hash: string,
	): CrawledPage {
		return this.indexManager.registerPage(url, file, depth, links, metadata, title, hash);
	}

	/** ページを保存 */
	savePage(
		url: string,
		markdown: string,
		depth: number,
		links: string[],
		metadata: PageMetadata,
		title: string | null,
		hash?: string,
	): string {
		const pageFile = this.buildPageFilename(url, metadata, title);
		const pagePath = join(this.workingOutputDir, pageFile);
		const computedHash = hash ?? computeHash(markdown);

		const frontmatter = this.buildFrontmatter(url, metadata, title, depth, computedHash);
		writeFileSync(pagePath, frontmatter + markdown);

		this.registerPage(url, pageFile, depth, links, metadata, title, computedHash);

		return pageFile;
	}

	/** YAML文字列をエスケープ（ダブルクォート内で使用） */
	private escapeYamlString(str: string): string {
		return str
			.replace(/\\/g, "\\\\") // バックスラッシュを最初にエスケープ
			.replace(/"/g, '\\"') // ダブルクォート
			.replace(/\n/g, "\\n") // 改行
			.replace(/\r/g, "\\r") // キャリッジリターン
			.replace(/\t/g, "\\t"); // タブ
	}

	/** frontmatterを構築 (public: Crawler の --no-pages モードで使用) */
	buildFrontmatter(
		url: string,
		metadata: PageMetadata,
		title: string | null,
		depth: number,
		hash?: string,
	): string {
		const pageCrawledAt = new Date().toISOString();
		const lines: (string | null)[] = [
			"---",
			`url: ${url}`,
			`title: "${this.escapeYamlString(metadata.title || title || "")}"`,
			metadata.description ? `description: "${this.escapeYamlString(metadata.description)}"` : null,
			metadata.keywords ? `keywords: "${this.escapeYamlString(metadata.keywords)}"` : null,
			hash ? `hash: "${hash}"` : null,
			`crawledAt: ${pageCrawledAt}`,
			`depth: ${depth}`,
			"---",
			"",
			"",
		];
		return lines.filter((line): line is string => line !== null).join("\n");
	}

	/** インデックスを保存 */
	saveIndex(): string {
		return this.indexManager.saveIndex();
	}

	/** 結果を取得 */
	getResult() {
		return this.indexManager.getResult();
	}

	/** 既存のインデックスマネージャーを取得 */
	getIndexManager(): IndexManager {
		return this.indexManager;
	}

	/** 作業ディレクトリを取得（PostProcessorなどで使用） */
	getWorkingOutputDir(): string {
		return this.workingOutputDir;
	}

	/** 訪問済みURLを設定（差分クロール時のマージ範囲制限用） */
	setVisitedUrls(urls: Set<string>): void {
		this.indexManager.setVisitedUrls(urls);
	}

	/**
	 * 前回のfinalize中断からのリカバリ
	 * .bak が存在し、最終ディレクトリが存在しない場合に復元する
	 */
	private recoverFromIncompleteFinalization(backupDir: string): void {
		// Recovery logic: 前回のfinalizeが中断された場合の復旧
		// (.bakが存在するが最終ディレクトリが存在しない = Step 1完了後、Step 2実行前にクラッシュ)
		if (existsSync(backupDir) && !existsSync(this.finalOutputDir)) {
			this.logger?.logDebug("Detected incomplete previous finalization, recovering from backup", {
				backupDir,
				finalOutputDir: this.finalOutputDir,
			});

			try {
				renameSync(backupDir, this.finalOutputDir);
				this.logger?.logDebug("Successfully recovered from backup");
			} catch (error) {
				this.logger?.logDebug("Failed to recover from backup", {
					error: error instanceof Error ? error.message : String(error),
				});
				// リカバリに失敗しても通常のfinalizeを続行
			}
		}
	}

	/**
	 * 既存の最終ディレクトリを .bak にバックアップ
	 * 既存ディレクトリがある場合のみ実行
	 */
	private backupExistingOutput(backupDir: string): void {
		if (existsSync(this.finalOutputDir)) {
			if (existsSync(backupDir)) {
				rmSync(backupDir, { recursive: true, force: true });
			}
			renameSync(this.finalOutputDir, backupDir);
		}
	}

	/**
	 * 一時ディレクトリを最終ディレクトリにリネーム
	 * 失敗時はバックアップを復元してエラーをスロー
	 */
	private promoteTemp(backupDir: string): void {
		if (!this.tempOutputDir) {
			return;
		}

		try {
			renameSync(this.tempOutputDir, this.finalOutputDir);
		} catch (error) {
			// リネーム失敗時: バックアップを復元
			this.logger?.logDebug("Failed to rename temp directory, restoring backup", {
				error: error instanceof Error ? error.message : String(error),
			});

			if (existsSync(backupDir)) {
				try {
					renameSync(backupDir, this.finalOutputDir);
					this.logger?.logDebug("Restored backup after finalize failure");
				} catch (restoreError) {
					this.logger?.logDebug("Failed to restore backup", {
						backupDir,
						error: restoreError instanceof Error ? restoreError.message : String(restoreError),
					});
				}
			}

			throw error; // 元のエラーを再スロー
		}
	}

	/**
	 * 成功時にバックアップディレクトリを削除
	 * 削除失敗は無視（non-fatal）
	 */
	private removeBackup(backupDir: string): void {
		if (existsSync(backupDir)) {
			try {
				rmSync(backupDir, { recursive: true, force: true });
			} catch (error) {
				this.logger?.logDebug("Failed to remove backup (non-fatal)", {
					backupDir,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	/** クロール成功時: 一時ディレクトリを最終ディレクトリにリネーム */
	finalize(): void {
		if (!this.tempOutputDir) {
			return; // diffモード時は何もしない
		}

		this.logger?.logDebug("Finalizing output", {
			from: this.tempOutputDir,
			to: this.finalOutputDir,
		});

		const backupDir = `${this.finalOutputDir}.bak`;

		this.recoverFromIncompleteFinalization(backupDir);
		this.backupExistingOutput(backupDir);
		this.promoteTemp(backupDir);
		this.removeBackup(backupDir);

		this.logger?.logDebug("Output finalized successfully");
	}

	/** クロール失敗時: 一時ディレクトリを削除 */
	cleanup(): void {
		if (this.tempOutputDir && existsSync(this.tempOutputDir)) {
			rmSync(this.tempOutputDir, { recursive: true, force: true });
			this.logger?.logDebug("Temporary output cleaned up", {
				path: this.tempOutputDir,
			});
		}
	}
}
