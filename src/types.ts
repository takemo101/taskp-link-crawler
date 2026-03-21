/** クロール設定 */
export interface CrawlConfig {
	startUrl: string;
	maxDepth: number;
	/** 最大クロールページ数（nullは無制限） */
	maxPages: number | null;
	outputDir: string;
	sameDomain: boolean;
	includePattern: RegExp | null;
	excludePattern: RegExp | null;
	/** リクエスト間隔（ミリ秒） */
	delay: number;
	/** リクエストタイムアウト（ミリ秒） */
	timeout: number;
	/** SPAページ待機時間（ミリ秒） */
	spaWait: number;
	headed: boolean;
	diff: boolean;
	pages: boolean;
	merge: boolean;
	chunks: boolean;
	keepSession: boolean;
	/** robots.txt を尊重するか（デフォルト: true） */
	respectRobots: boolean;
	/** クローラーのバージョン（package.jsonから取得） */
	version: string;
}

/** フェッチ結果 */
export interface FetchResult {
	html: string;
	finalUrl: string;
	contentType: string;
}

/** ページメタデータ */
export interface PageMetadata {
	title: string | null;
	description: string | null;
	keywords: string | null;
	author: string | null;
	ogTitle: string | null;
	ogType: string | null;
}

/** クロール済みページ情報 */
export interface CrawledPage {
	url: string;
	title: string | null;
	file: string;
	depth: number;
	links: string[];
	metadata: PageMetadata;
	/** コンテンツのSHA-256ハッシュ（差分検出用） */
	hash: string;
	/** このページがクロールされた日時 */
	crawledAt: string;
}

/** 検出されたAPI仕様 */
export interface DetectedSpec {
	url: string;
	type: string;
	file: string;
}

/** クロール結果 */
export interface CrawlResult {
	crawledAt: string;
	baseUrl: string;
	config: Pick<CrawlConfig, "maxDepth" | "sameDomain">;
	totalPages: number;
	pages: CrawledPage[];
	specs: DetectedSpec[];
}

/** Fetcher インターフェース */
export interface Fetcher {
	fetch(url: string): Promise<FetchResult | null>;
	close?(): Promise<void>;
}

/** ロガーインターフェース（output モジュールが依存） */
export interface Logger {
	logIndexFormatError(path: string): void;
	logIndexLoadError(error: string): void;
	logDebug(message: string, data?: unknown): void;
}
