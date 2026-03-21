/** デフォルト設定値 */
export const DEFAULTS = {
	/** 最大クロール深度 */
	MAX_DEPTH: 1,
	/** 最大深度上限 */
	MAX_DEPTH_LIMIT: 10,
	/** 最大クロールページ数の上限 */
	MAX_PAGES_LIMIT: 10000,
	/** 出力ディレクトリ */
	OUTPUT_DIR: "./.context",
	/** リクエスト間の遅延(ms) */
	DELAY_MS: 500,
	/** リクエスト間の遅延の上限(ms) */
	MAX_DELAY_MS: 60000,
	/** デフォルトタイムアウト(秒) */
	TIMEOUT_SEC: 30,
	/** タイムアウト上限(秒) */
	MAX_TIMEOUT_SEC: 300,
	/** SPAページ待機時間(ms) */
	SPA_WAIT_MS: 2000,
	/** SPAページ待機時間の上限(ms) */
	MAX_SPA_WAIT_MS: 30000,
} as const;

/** ファイル名・プレフィックス */
export const FILENAME = {
	/** ページファイルのプレフィックス */
	PAGE_PREFIX: "page-",
	/** ページファイルのパディング桁数 */
	PAGE_PAD_LENGTH: 3,
	/** チャンクファイルのプレフィックス */
	CHUNK_PREFIX: "chunk-",
	/** 結合出力ファイル名 */
	FULL_MD: "full.md",
	/** インデックスファイル名 */
	INDEX_JSON: "index.json",
	/** ページ格納ディレクトリ */
	PAGES_DIR: "pages",
	/** 仕様ファイル格納ディレクトリ */
	SPECS_DIR: "specs",
	/** チャンク格納ディレクトリ */
	CHUNKS_DIR: "chunks",
} as const;

/** パターン定数 */
export const PATTERNS = {
	/** Playwright CLI出力パターン */
	CLI_RESULT: /^### Result\n"([\s\S]*)"\n### Ran Playwright code/,
	/** Frontmatter区切り */
	FRONTMATTER_DELIMITER: "---",
	/** Markdown見出し */
	MARKDOWN_H1: "# ",
} as const;

/** API仕様ファイルのパターン */
export const SPEC_PATTERNS: Record<string, RegExp> = {
	openapi: /\/(openapi|swagger)\.(ya?ml|json)$/i,
	jsonSchema: /\.schema\.json$|\/schema\.json$/i,
	graphql: /\/schema\.graphql$/i,
} as const;

/** パス候補 */
export const PATHS = {
	/** Node.js実行ファイルの候補 */
	NODE_PATHS: [
		"node", // PATH上にあれば最速
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		"/usr/bin/node",
	],
	/** Playwright CLIの候補 */
	PLAYWRIGHT_PATHS: [
		"playwright-cli", // PATH上にあれば最速
		"/opt/homebrew/bin/playwright-cli",
		"/usr/local/bin/playwright-cli",
		...(process.env.HOME ? [`${process.env.HOME}/.npm-global/bin/playwright-cli`] : []),
	],
} as const;

/** 終了コード */
export const EXIT_CODES = {
	/** 正常終了 */
	SUCCESS: 0,
	/** 一般的なエラー */
	GENERAL_ERROR: 1,
	/** 無効な引数 */
	INVALID_ARGUMENTS: 2,
	/** 依存関係エラー */
	DEPENDENCY_ERROR: 3,
	/** クロールエラー */
	CRAWL_ERROR: 4,
} as const;
