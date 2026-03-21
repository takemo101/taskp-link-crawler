import { existsSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlLogger } from "../../src/crawler/logger.js";
import { IndexManager } from "../../src/output/index-manager.js";
import type { PageMetadata } from "../../src/types.js";

describe("IndexManager", () => {
	// テストごとに一意なディレクトリを生成
	let testDir: string;
	let testCounter = 0;

	beforeEach(async () => {
		// 各テストで一意なディレクトリを生成
		// 複数のランダム要素を組み合わせて衝突を回避
		testCounter++;
		const uniqueId = `${process.pid}-${testCounter}-${Date.now()}-${performance.now()}-${Math.random().toString(36).slice(2)}`;
		testDir = join(import.meta.dirname, `.test-index-manager-${uniqueId}`);
		await rm(testDir, { recursive: true, force: true });
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		if (testDir) {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	describe("constructor", () => {
		it("should initialize with empty state when no existing index", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			const result = manager.getResult();
			expect(result.pages.length).toBe(0);
			expect(result.specs.length).toBe(0);
		});

		it("should load existing index.json", async () => {
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: { maxDepth: 2, sameDomain: true },
				totalPages: 1,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "abc123",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			expect(manager.getExistingHashes().size).toBe(1);
			expect(manager.getExistingHashes().get("https://example.com/page1")).toBe("abc123");
		});
	});

	describe("loadExistingIndex", () => {
		it("should handle missing index.json gracefully", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			expect(manager.getExistingHashes().size).toBe(0);
		});

		it("should handle invalid JSON", async () => {
			const mockLogger = {
				logIndexLoadError: vi.fn(),
			} as unknown as CrawlLogger;
			writeFileSync(join(testDir, "index.json"), "{ invalid json }");

			const manager = new IndexManager(
				testDir,
				"https://example.com",
				{
					maxDepth: 2,
					sameDomain: true,
				},
				mockLogger,
			);

			expect(manager.getExistingHashes().size).toBe(0);
			expect(mockLogger.logIndexLoadError).toHaveBeenCalledTimes(1);
			expect(mockLogger.logIndexLoadError).toHaveBeenCalledWith(expect.any(String));
		});

		it("should handle empty pages array", async () => {
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: {},
				totalPages: 0,
				pages: [],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			expect(manager.getExistingHashes().size).toBe(0);
		});

		it("should handle pages property not being an array", async () => {
			const mockLogger = {
				logIndexFormatError: vi.fn(),
			} as unknown as CrawlLogger;
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: {},
				totalPages: 0,
				pages: "not an array",
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(
				testDir,
				"https://example.com",
				{
					maxDepth: 2,
					sameDomain: true,
				},
				mockLogger,
			);

			expect(manager.getExistingHashes().size).toBe(0);
			expect(mockLogger.logIndexFormatError).toHaveBeenCalledWith(
				expect.stringContaining(join(testDir, "index.json")),
			);
		});

		it("should handle missing pages property", async () => {
			const mockLogger = {
				logIndexFormatError: vi.fn(),
			} as unknown as CrawlLogger;
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: {},
				totalPages: 0,
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(
				testDir,
				"https://example.com",
				{
					maxDepth: 2,
					sameDomain: true,
				},
				mockLogger,
			);

			expect(manager.getExistingHashes().size).toBe(0);
			expect(mockLogger.logIndexFormatError).toHaveBeenCalledWith(
				expect.stringContaining(join(testDir, "index.json")),
			);
		});

		it("should handle null value", async () => {
			const mockLogger = {
				logIndexFormatError: vi.fn(),
			} as unknown as CrawlLogger;
			writeFileSync(join(testDir, "index.json"), "null");

			const manager = new IndexManager(
				testDir,
				"https://example.com",
				{
					maxDepth: 2,
					sameDomain: true,
				},
				mockLogger,
			);

			expect(manager.getExistingHashes().size).toBe(0);
			expect(mockLogger.logIndexFormatError).toHaveBeenCalledWith(
				expect.stringContaining(join(testDir, "index.json")),
			);
		});

		it("should handle primitive value", async () => {
			const mockLogger = {
				logIndexFormatError: vi.fn(),
			} as unknown as CrawlLogger;
			writeFileSync(join(testDir, "index.json"), "123");

			const manager = new IndexManager(
				testDir,
				"https://example.com",
				{
					maxDepth: 2,
					sameDomain: true,
				},
				mockLogger,
			);

			expect(manager.getExistingHashes().size).toBe(0);
			expect(mockLogger.logIndexFormatError).toHaveBeenCalledWith(
				expect.stringContaining(join(testDir, "index.json")),
			);
		});
	});

	describe("getExistingHashes", () => {
		it("should return map of all existing hashes", async () => {
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: {},
				totalPages: 2,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash1",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page2",
						title: "Page 2",
						file: "pages/page-002.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 2",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash2",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			const hashes = manager.getExistingHashes();

			expect(hashes.size).toBe(2);
			expect(hashes.get("https://example.com/page1")).toBe("hash1");
			expect(hashes.get("https://example.com/page2")).toBe("hash2");
		});

		it("should skip pages without hash", async () => {
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: {},
				totalPages: 2,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash1",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page2",
						title: "Page 2",
						file: "pages/page-002.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 2",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						// no hash
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			const hashes = manager.getExistingHashes();

			expect(hashes.size).toBe(1);
			expect(hashes.get("https://example.com/page1")).toBe("hash1");
			expect(hashes.has("https://example.com/page2")).toBe(false);
		});

		it("should return empty map when no existing index", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			const hashes = manager.getExistingHashes();

			expect(hashes.size).toBe(0);
		});
	});

	describe("getNextPageNumber", () => {
		it("should return 1 for new manager", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			expect(manager.getNextPageNumber()).toBe(1);
		});

		it("should increment after registering pages", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			expect(manager.getNextPageNumber()).toBe(1);
			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1",
				"hash1",
			);
			expect(manager.getNextPageNumber()).toBe(2);
			manager.registerPage(
				"https://example.com/page2",
				"pages/page-002.md",
				1,
				[],
				metadata,
				"Page 2",
				"hash2",
			);
			expect(manager.getNextPageNumber()).toBe(3);
		});
	});

	describe("registerPage", () => {
		it("should register page with correct data", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});
			const metadata: PageMetadata = {
				title: "Test Page",
				description: "Test description",
				keywords: "test, keywords",
				author: "Test Author",
				ogTitle: "OG Title",
				ogType: "article",
			};

			const page = manager.registerPage(
				"https://example.com/test",
				"pages/page-001.md",
				0,
				["https://example.com/link1"],
				metadata,
				"Test Page",
				"abc123",
			);

			expect(page.url).toBe("https://example.com/test");
			expect(page.title).toBe("Test Page");
			expect(page.file).toBe("pages/page-001.md");
			expect(page.depth).toBe(0);
			expect(page.links).toEqual(["https://example.com/link1"]);
			expect(page.metadata).toEqual(metadata);
			expect(page.hash).toBe("abc123");
			expect(page.crawledAt).toBeDefined();
		});

		it("should increment totalPages", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			expect(manager.getResult().pages.length).toBe(0);
			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1",
				"hash1",
			);
			expect(manager.getResult().pages.length).toBe(1);
			manager.registerPage(
				"https://example.com/page2",
				"pages/page-002.md",
				1,
				[],
				metadata,
				"Page 2",
				"hash2",
			);
			expect(manager.getResult().pages.length).toBe(2);
		});

		it("should use metadata.title over title parameter when available", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});
			const metadata: PageMetadata = {
				title: "Metadata Title",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			const page = manager.registerPage(
				"https://example.com/test",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Extracted Title",
				"hash",
			);

			expect(page.title).toBe("Metadata Title");
		});

		it("should fallback to title parameter when metadata.title is null", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});
			const metadata: PageMetadata = {
				title: null,
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			const page = manager.registerPage(
				"https://example.com/test",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Extracted Title",
				"hash",
			);

			expect(page.title).toBe("Extracted Title");
		});
	});

	describe("addSpec", () => {
		it("should add spec to result", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			expect(manager.getResult().specs.length).toBe(0);
			manager.addSpec("https://example.com/openapi.yaml", "openapi", "specs/openapi.yaml");
			expect(manager.getResult().specs.length).toBe(1);
		});

		it("should add multiple specs", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			manager.addSpec("https://example.com/openapi.yaml", "openapi", "specs/openapi.yaml");
			manager.addSpec("https://example.com/schema.json", "jsonSchema", "specs/schema.json");

			expect(manager.getResult().specs.length).toBe(2);
		});
	});

	describe("saveIndex", () => {
		it("should save index.json file", async () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1",
				"hash1",
			);
			manager.addSpec("https://example.com/openapi.yaml", "openapi", "specs/openapi.yaml");

			const savedPath = manager.saveIndex();

			expect(savedPath).toBe(join(testDir, "index.json"));
			expect(existsSync(savedPath)).toBe(true);

			const content = await readFile(savedPath, "utf-8");
			const data = JSON.parse(content);

			expect(data.baseUrl).toBe("https://example.com");
			expect(data.config.maxDepth).toBe(2);
			expect(data.config.sameDomain).toBe(true);
			expect(data.totalPages).toBe(1);
			expect(data.pages).toHaveLength(1);
			expect(data.specs).toHaveLength(1);
			expect(data.crawledAt).toBeDefined();
		});

		it("should return correct file path", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
			});

			const savedPath = manager.saveIndex();

			expect(savedPath).toBe(join(testDir, "index.json"));
		});

		it("should be idempotent when called multiple times in diff mode", async () => {
			// 既存のindex.jsonを作成
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: { maxDepth: 2, sameDomain: true },
				totalPages: 2,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash1",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page2",
						title: "Page 2",
						file: "pages/page-002.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 2",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash2",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
				diff: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			// page1のみ更新（page2は変更なし）
			const visited = new Set(["https://example.com/page1", "https://example.com/page2"]);
			manager.setVisitedUrls(visited);

			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1 Updated",
				"hash1-new",
			);

			// saveIndex を複数回呼び出す
			manager.saveIndex();
			manager.saveIndex();

			const result = manager.getResult();

			// page1とpage2の2ページのみ（重複なし）
			expect(result.totalPages).toBe(2);
			expect(result.pages).toHaveLength(2);

			// ページのURLを確認
			const urls = result.pages.map((p) => p.url).sort();
			expect(urls).toEqual(["https://example.com/page1", "https://example.com/page2"]);
		});
	});

	describe("getResult", () => {
		it("should return current result state", () => {
			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 3,
				sameDomain: false,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1",
				"hash1",
			);

			const result = manager.getResult();

			expect(result.baseUrl).toBe("https://example.com");
			expect(result.config.maxDepth).toBe(3);
			expect(result.config.sameDomain).toBe(false);
			expect(result.totalPages).toBe(1);
			expect(result.pages).toHaveLength(1);
		});
	});

	describe("diff mode with visited URLs", () => {
		it("should merge only visited pages when visitedUrls is set", async () => {
			// 既存のindex.jsonを作成
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: { maxDepth: 2, sameDomain: true },
				totalPages: 2,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash1",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page2",
						title: "Page 2",
						file: "pages/page-002.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 2",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash2",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
				diff: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			// page1のみ訪問（page2は削除されたと仮定）
			const visited = new Set(["https://example.com/page1"]);
			manager.setVisitedUrls(visited);

			// page1のみ登録
			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1 Updated",
				"hash1-new",
			);

			manager.saveIndex();
			const result = manager.getResult();

			// page1のみ残る（page2は削除されたため除外）
			expect(result.totalPages).toBe(1);
			expect(result.pages).toHaveLength(1);
			expect(result.pages[0].url).toBe("https://example.com/page1");
		});

		it("should merge unchanged visited pages", async () => {
			// 既存のindex.jsonを作成
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: { maxDepth: 2, sameDomain: true },
				totalPages: 3,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash1",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page2",
						title: "Page 2",
						file: "pages/page-002.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 2",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash2",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page3",
						title: "Page 3",
						file: "pages/page-003.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 3",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash3",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
				diff: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			// page1, page2, page3を訪問（page2のみ変更なし）
			const visited = new Set([
				"https://example.com/page1",
				"https://example.com/page2",
				"https://example.com/page3",
			]);
			manager.setVisitedUrls(visited);

			// page1とpage3のみ登録（page2は変更なしでスキップ）
			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1 Updated",
				"hash1-new",
			);
			manager.registerPage(
				"https://example.com/page3",
				"pages/page-003.md",
				1,
				[],
				metadata,
				"Page 3 Updated",
				"hash3-new",
			);

			manager.saveIndex();
			const result = manager.getResult();

			// 3ページ全て残る（page2は既存データからマージ）
			expect(result.totalPages).toBe(3);
			expect(result.pages).toHaveLength(3);
			const urls = result.pages.map((p) => p.url).sort();
			expect(urls).toEqual([
				"https://example.com/page1",
				"https://example.com/page2",
				"https://example.com/page3",
			]);
		});

		it("should exclude deleted pages when visitedUrls is set", async () => {
			// 既存のindex.jsonに3ページ
			const indexData = {
				crawledAt: "2025-01-01T00:00:00.000Z",
				baseUrl: "https://example.com",
				config: { maxDepth: 2, sameDomain: true },
				totalPages: 3,
				pages: [
					{
						url: "https://example.com/page1",
						title: "Page 1",
						file: "pages/page-001.md",
						depth: 0,
						links: [],
						metadata: {
							title: "Page 1",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash1",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page2",
						title: "Page 2",
						file: "pages/page-002.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 2",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash2",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
					{
						url: "https://example.com/page3",
						title: "Page 3",
						file: "pages/page-003.md",
						depth: 1,
						links: [],
						metadata: {
							title: "Page 3",
							description: null,
							keywords: null,
							author: null,
							ogTitle: null,
							ogType: null,
						},
						hash: "hash3",
						crawledAt: "2025-01-01T00:00:00.000Z",
					},
				],
				specs: [],
			};
			writeFileSync(join(testDir, "index.json"), JSON.stringify(indexData));

			const manager = new IndexManager(testDir, "https://example.com", {
				maxDepth: 2,
				sameDomain: true,
				diff: true,
			});
			const metadata: PageMetadata = {
				title: "Test",
				description: null,
				keywords: null,
				author: null,
				ogTitle: null,
				ogType: null,
			};

			// page1とpage2のみ訪問（page3は削除された）
			const visited = new Set(["https://example.com/page1", "https://example.com/page2"]);
			manager.setVisitedUrls(visited);

			// page1のみ登録（page2は変更なし、page3は削除）
			manager.registerPage(
				"https://example.com/page1",
				"pages/page-001.md",
				0,
				[],
				metadata,
				"Page 1 Updated",
				"hash1-new",
			);

			manager.saveIndex();
			const result = manager.getResult();

			// page1とpage2のみ残る（page3は削除されたため除外）
			expect(result.totalPages).toBe(2);
			expect(result.pages).toHaveLength(2);
			const urls = result.pages.map((p) => p.url).sort();
			expect(urls).toEqual(["https://example.com/page1", "https://example.com/page2"]);
		});
	});
});
