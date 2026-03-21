import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { Crawler } from "../../src/crawler/index.js";
import type { CrawlLogger } from "../../src/crawler/logger.js";
import { FetchError, TimeoutError } from "../../src/errors.js";
import type { CrawlConfig, Fetcher, FetchResult } from "../../src/types.js";

describe("Crawler - Error Handling", () => {
	let config: CrawlConfig;
	let mockFetcher: Fetcher;
	let mockLogger: CrawlLogger;
	let crawler: Crawler;

	beforeEach(async () => {
		// 基本設定
		config = {
			startUrl: "https://example.com",
			outputDir: "/tmp/test-output",
			maxDepth: 2,
			maxPages: null,
			delay: 0,
			timeout: 5000,
			spaWait: 100,
			sameDomain: true,
			includePattern: null,
			excludePattern: null,
			diff: false,
			pages: true,
			merge: false,
			chunks: false,
			headed: false,
			keepSession: false,
			respectRobots: true,
			version: "test-version",
		};

		// Fetcherモック
		mockFetcher = {
			fetch: vi.fn(),
			close: vi.fn(),
		};

		// Crawlerインスタンス作成
		crawler = new Crawler(config, mockFetcher);

		// @ts-expect-error - private property access for testing
		mockLogger = crawler.logger;

		// logFetchErrorをスパイ
		vi.spyOn(mockLogger, "logFetchError");
		vi.spyOn(mockLogger, "logDebug");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("fetch() が null を返す場合", () => {
		it("logFetchError() が呼ばれ、クロールは続行する", async () => {
			// fetch() が null を返す（404等）
			(mockFetcher.fetch as Mock).mockResolvedValue(null);

			// クロール実行（エラーでスローされないことを確認）
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// logFetchError() が呼ばれたことを確認
			expect(mockLogger.logFetchError).toHaveBeenCalledWith(
				"https://example.com",
				"Page not available (404 or error page)",
				0,
			);

			// fetch() は1回だけ呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("fetch() が FetchError をスローする場合", () => {
		it("エラーがキャッチされ、logFetchError() が呼ばれ、クロールは続行する", async () => {
			const fetchError = new FetchError(
				"Failed to open page: Network error",
				"https://example.com",
			);
			(mockFetcher.fetch as Mock).mockRejectedValue(fetchError);

			// クロール実行（エラーでスローされないことを確認）
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// logFetchError() が呼ばれたことを確認
			expect(mockLogger.logFetchError).toHaveBeenCalledWith(
				"https://example.com",
				"Failed to open page: Network error",
				0,
			);

			// fetch() は1回だけ呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("fetch() が TimeoutError をスローする場合", () => {
		it("エラーがキャッチされ、logFetchError() が呼ばれ、クロールは続行する", async () => {
			const timeoutError = new TimeoutError("Request timeout after 5s (5000ms)", 5000);
			(mockFetcher.fetch as Mock).mockRejectedValue(timeoutError);

			// クロール実行（エラーでスローされないことを確認）
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// logFetchError() が呼ばれたことを確認
			expect(mockLogger.logFetchError).toHaveBeenCalledWith(
				"https://example.com",
				"Request timeout after 5s (5000ms)",
				0,
			);

			// fetch() は1回だけ呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("fetch() が汎用 Error をスローする場合", () => {
		it("エラーがキャッチされ、logFetchError() が呼ばれ、クロールは続行する", async () => {
			const genericError = new Error("Unknown error occurred");
			(mockFetcher.fetch as Mock).mockRejectedValue(genericError);

			// クロール実行（エラーでスローされないことを確認）
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// logFetchError() が呼ばれたことを確認
			expect(mockLogger.logFetchError).toHaveBeenCalledWith(
				"https://example.com",
				"Unknown error occurred",
				0,
			);

			// fetch() は1回だけ呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("fetch() が非Errorオブジェクトをスローする場合", () => {
		it("文字列に変換され、logFetchError() が呼ばれ、クロールは続行する", async () => {
			(mockFetcher.fetch as Mock).mockRejectedValue("String error");

			// クロール実行（エラーでスローされないことを確認）
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// logFetchError() が呼ばれたことを確認
			expect(mockLogger.logFetchError).toHaveBeenCalledWith(
				"https://example.com",
				"String error",
				0,
			);

			// fetch() は1回だけ呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("fetch() が成功した場合", () => {
		it("logFetchError() は呼ばれず、通常の処理が続行される", async () => {
			const successResult: FetchResult = {
				html: "<html><head><title>Test</title></head><body><p>Content</p></body></html>",
				finalUrl: "https://example.com",
				contentType: "text/html",
			};
			(mockFetcher.fetch as Mock).mockResolvedValue(successResult);

			// クロール実行
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// logFetchError() は呼ばれない
			expect(mockLogger.logFetchError).not.toHaveBeenCalled();

			// fetch() は1回だけ呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("複数ページのクロールでエラーが発生した場合", () => {
		it("エラーページはスキップされ、他のページは正常にクロールされる", async () => {
			// 1ページ目: 成功
			const successResult: FetchResult = {
				html: "<html><head><title>Page 1</title></head><body><a href='https://example.com/page2'>Link</a></body></html>",
				finalUrl: "https://example.com",
				contentType: "text/html",
			};

			// 2ページ目: エラー
			const fetchError = new FetchError("Network error", "https://example.com/page2");

			(mockFetcher.fetch as Mock)
				.mockResolvedValueOnce(successResult) // 1回目: 成功
				.mockRejectedValueOnce(fetchError); // 2回目: エラー

			// クロール実行
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// fetch() は2回呼ばれる（1ページ目 + 2ページ目）
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(2);

			// logFetchError() は1回だけ呼ばれる（2ページ目のエラー）
			expect(mockLogger.logFetchError).toHaveBeenCalledTimes(1);
			expect(mockLogger.logFetchError).toHaveBeenCalledWith(
				"https://example.com/page2",
				"Network error",
				1, // depth 1
			);
		});
	});

	describe("フェッチ失敗URLのリトライ機構", () => {
		it("一時的なエラー後、他ページからのリンクでリトライされる", async () => {
			// ページ1: 成功（page2へのリンク）
			const _page1Result: FetchResult = {
				html: '<html><head><title>Page 1</title></head><body><a href="https://example.com/page2">Link to Page 2</a></body></html>',
				finalUrl: "https://example.com",
				contentType: "text/html",
			};

			// ページ2: 1回目は失敗、2回目は成功
			const timeoutError = new TimeoutError("Request timeout", 5000);
			const page2Result: FetchResult = {
				html: "<html><head><title>Page 2</title></head><body><p>Content</p></body></html>",
				finalUrl: "https://example.com/page2",
				contentType: "text/html",
			};

			// ページ3: 成功（page2へのリンク）
			const page3Result: FetchResult = {
				html: "<html><head><title>Page 3</title></head><body><a href='https://example.com/page2'>Link to Page 2</a></body></html>",
				finalUrl: "https://example.com/page3",
				contentType: "text/html",
			};

			// ページ1に page3 へのリンクを追加
			const page1WithPage3: FetchResult = {
				html: "<html><head><title>Page 1</title></head><body><a href='https://example.com/page2'>Page 2</a><a href='https://example.com/page3'>Page 3</a></body></html>",
				finalUrl: "https://example.com",
				contentType: "text/html",
			};

			(mockFetcher.fetch as Mock)
				.mockResolvedValueOnce(page1WithPage3) // 1. page1 成功
				.mockRejectedValueOnce(timeoutError) // 2. page2 失敗（1回目）
				.mockResolvedValueOnce(page3Result) // 3. page3 成功
				.mockResolvedValueOnce(page2Result); // 4. page2 成功（リトライ）

			// クロール実行
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// fetch() は4回呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(4);

			// page2は2回フェッチされる（1回失敗 + 1回成功）
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(2, "https://example.com/page2");
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(4, "https://example.com/page2");

			// logFetchError() は1回（page2の1回目失敗）
			expect(mockLogger.logFetchError).toHaveBeenCalledTimes(1);
		});

		it("リトライ上限（2回）到達後はリトライされない", async () => {
			// 複数ページから page2 へリンク、3回失敗させる
			// MAX_RETRIES = 2 の場合、初回 + リトライ2回 = 合計3回までフェッチされる
			const page1Result: FetchResult = {
				html: "<html><head><title>Page 1</title></head><body><a href='https://example.com/page2'>Page 2</a><a href='https://example.com/page3'>Page 3</a><a href='https://example.com/page4'>Page 4</a></body></html>",
				finalUrl: "https://example.com",
				contentType: "text/html",
			};

			const page3Result: FetchResult = {
				html: "<html><head><title>Page 3</title></head><body><a href='https://example.com/page2'>Page 2</a></body></html>",
				finalUrl: "https://example.com/page3",
				contentType: "text/html",
			};

			const page4Result: FetchResult = {
				html: "<html><head><title>Page 4</title></head><body><a href='https://example.com/page2'>Page 2</a></body></html>",
				finalUrl: "https://example.com/page4",
				contentType: "text/html",
			};

			const fetchError = new FetchError("Network error", "https://example.com/page2");

			(mockFetcher.fetch as Mock)
				.mockResolvedValueOnce(page1Result) // 1. page1 成功
				.mockRejectedValueOnce(fetchError) // 2. page2 失敗（初回）
				.mockResolvedValueOnce(page3Result) // 3. page3 成功
				.mockRejectedValueOnce(fetchError) // 4. page2 失敗（リトライ1回目）
				.mockResolvedValueOnce(page4Result) // 5. page4 成功
				.mockRejectedValueOnce(fetchError); // 6. page2 失敗（リトライ2回目）
			// 7回目以降: page2 はスキップ（visited.has()がtrue、リトライ上限到達）

			// クロール実行
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// fetch() は6回呼ばれる（page1, page2×3, page3, page4）
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(6);

			// page2は3回フェッチされる（初回 + リトライ2回）
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(2, "https://example.com/page2");
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(4, "https://example.com/page2");
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(6, "https://example.com/page2");

			// logFetchError() は3回（page2の3回の失敗）
			expect(mockLogger.logFetchError).toHaveBeenCalledTimes(3);
		});

		it("fetch()がnullを返す場合（404等）もリトライ上限が適用される", async () => {
			// 404エラーもリトライ対象とする
			const page1Result: FetchResult = {
				html: "<html><head><title>Page 1</title></head><body><a href='https://example.com/page2'>Page 2</a><a href='https://example.com/page3'>Page 3</a></body></html>",
				finalUrl: "https://example.com",
				contentType: "text/html",
			};

			const page3Result: FetchResult = {
				html: "<html><head><title>Page 3</title></head><body><a href='https://example.com/page2'>Page 2</a></body></html>",
				finalUrl: "https://example.com/page3",
				contentType: "text/html",
			};

			(mockFetcher.fetch as Mock)
				.mockResolvedValueOnce(page1Result) // 1. page1 成功
				.mockResolvedValueOnce(null) // 2. page2 失敗（404）
				.mockResolvedValueOnce(page3Result) // 3. page3 成功
				.mockResolvedValueOnce(null); // 4. page2 失敗（404、2回目）

			// クロール実行
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// fetch() は4回呼ばれる
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(4);

			// page2は2回フェッチされる
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(2, "https://example.com/page2");
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(4, "https://example.com/page2");

			// logFetchError() は2回
			expect(mockLogger.logFetchError).toHaveBeenCalledTimes(2);
		});

		it("フェッチ成功後、リトライカウントがクリアされる", async () => {
			// page2: 1回失敗 → 2回目成功 → 3回目はvisitedによりスキップ
			const page1Result: FetchResult = {
				html: "<html><head><title>Page 1</title></head><body><a href='https://example.com/page2'>Page 2</a><a href='https://example.com/page3'>Page 3</a><a href='https://example.com/page4'>Page 4</a></body></html>",
				finalUrl: "https://example.com",
				contentType: "text/html",
			};

			const page2Result: FetchResult = {
				html: "<html><head><title>Page 2</title></head><body><p>Content</p></body></html>",
				finalUrl: "https://example.com/page2",
				contentType: "text/html",
			};

			const page3Result: FetchResult = {
				html: "<html><head><title>Page 3</title></head><body><a href='https://example.com/page2'>Page 2</a></body></html>",
				finalUrl: "https://example.com/page3",
				contentType: "text/html",
			};

			const page4Result: FetchResult = {
				html: "<html><head><title>Page 4</title></head><body><a href='https://example.com/page2'>Page 2</a></body></html>",
				finalUrl: "https://example.com/page4",
				contentType: "text/html",
			};

			const fetchError = new FetchError("Network error", "https://example.com/page2");

			(mockFetcher.fetch as Mock)
				.mockResolvedValueOnce(page1Result) // 1. page1 成功
				.mockRejectedValueOnce(fetchError) // 2. page2 失敗
				.mockResolvedValueOnce(page3Result) // 3. page3 成功
				.mockResolvedValueOnce(page2Result) // 4. page2 成功（リトライ）
				.mockResolvedValueOnce(page4Result); // 5. page4 成功
			// 6. page2 はスキップ（visited.has()がtrue、ただしfailedUrlsには存在しない）

			// クロール実行
			// @ts-expect-error - private method access for testing
			await expect(crawler.crawl("https://example.com", 0)).resolves.toBeUndefined();

			// fetch() は5回呼ばれる（page2は2回フェッチ、3回目はスキップ）
			expect(mockFetcher.fetch).toHaveBeenCalledTimes(5);

			// page2は2回フェッチされる
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(2, "https://example.com/page2");
			expect(mockFetcher.fetch).toHaveBeenNthCalledWith(4, "https://example.com/page2");

			// logFetchError() は1回（page2の1回目失敗のみ）
			expect(mockLogger.logFetchError).toHaveBeenCalledTimes(1);
		});
	});
});
