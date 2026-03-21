import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Crawler } from "../../src/crawler/index.js";
import type { CrawlConfig, Fetcher, FetchResult } from "../../src/types.js";

// テストごとに一意なディレクトリを生成
let testOutputDir: string;

/** テスト用のモックFetcher */
class MockFetcher implements Fetcher {
	private pages: Map<string, { html: string; contentType: string }>;
	private callCount = 0;
	private _closed = false;

	constructor(pages: Record<string, { html: string; contentType?: string }>) {
		this.pages = new Map();
		for (const [url, data] of Object.entries(pages)) {
			this.pages.set(url, {
				html: data.html,
				contentType: data.contentType || "text/html",
			});
		}
	}

	async fetch(url: string): Promise<FetchResult | null> {
		if (this._closed) {
			return null;
		}
		this.callCount++;
		const page = this.pages.get(url);
		if (!page) {
			return null;
		}
		return {
			html: page.html,
			finalUrl: url,
			contentType: page.contentType,
		};
	}

	getCallCount(): number {
		return this.callCount;
	}

	async close(): Promise<void> {
		this._closed = true;
	}
}

/** テスト用HTMLを生成 */
function createTestHtml(options: {
	title: string;
	content: string;
	links?: string[];
	meta?: { description?: string; keywords?: string };
}): string {
	const linksHtml = (options.links || []).map((link) => `<a href="${link}">${link}</a>`).join("\n");

	const metaHtml = [
		options.meta?.description
			? `<meta name="description" content="${options.meta.description}">`
			: "",
		options.meta?.keywords ? `<meta name="keywords" content="${options.meta.keywords}">` : "",
	].join("\n");

	return `<!DOCTYPE html>
<html>
<head>
	<title>${options.title}</title>
	${metaHtml}
</head>
<body>
	<main>
		<h1>${options.title}</h1>
		${options.content}
	</main>
	<nav>
		${linksHtml}
	</nav>
</body>
</html>`;
}

/** デフォルトのテスト設定を取得 */
const getDefaultConfig = (): CrawlConfig => ({
	startUrl: "https://example.com",
	maxDepth: 2,
	maxPages: null,
	outputDir: testOutputDir,
	sameDomain: true,
	includePattern: null,
	excludePattern: null,
	delay: 0,
	timeout: 30000,
	spaWait: 0,
	headed: false,
	diff: false,
	pages: true,
	merge: true,
	chunks: true,
	keepSession: false,
	respectRobots: true,
	version: "test-version",
});

describe("Crawler Integration", () => {
	let testCounter = 0;

	beforeEach(() => {
		// 各テストで一意なディレクトリを生成
		// 複数のランダム要素を組み合わせて衝突を回避
		testCounter++;
		const uniqueId = `${process.pid}-${testCounter}-${Date.now()}-${performance.now()}-${Math.random().toString(36).slice(2)}`;
		testOutputDir = join(import.meta.dirname, `.test-output-integration-${uniqueId}`);
		rmSync(testOutputDir, { recursive: true, force: true });
	});

	afterEach(() => {
		if (testOutputDir) {
			rmSync(testOutputDir, { recursive: true, force: true });
		}
	});

	describe("E2E-style crawling with mock Fetcher", () => {
		it("should crawl single page and generate output files", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home Page",
						content: "<p>This is the home page content.</p>",
						links: ["/about", "/contact"],
					}),
				},
			});

			const crawler = new Crawler(getDefaultConfig(), mockFetcher);
			await crawler.run();

			expect(existsSync(testOutputDir)).toBe(true);
			expect(existsSync(join(testOutputDir, "pages"))).toBe(true);
			expect(existsSync(join(testOutputDir, "specs"))).toBe(true);

			const indexPath = join(testOutputDir, "index.json");
			expect(existsSync(indexPath)).toBe(true);

			const indexContent = JSON.parse(readFileSync(indexPath, "utf-8"));
			expect(indexContent.totalPages).toBe(1);
			expect(indexContent.pages).toHaveLength(1);
			expect(indexContent.pages[0].url).toBe("https://example.com");
			expect(indexContent.pages[0].title).toBe("Home Page");
			expect(indexContent.pages[0].hash).toBeDefined();
			expect(indexContent.pages[0].crawledAt).toBeDefined();

			const pagePath = join(testOutputDir, indexContent.pages[0].file);
			expect(existsSync(pagePath)).toBe(true);

			const pageContent = readFileSync(pagePath, "utf-8");
			expect(pageContent).toContain("Home Page");
			expect(pageContent).toContain("home page content");
			expect(pageContent).toContain("---");
			expect(pageContent).toContain("url: https://example.com");
		});

		it("should crawl multiple pages with depth", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Welcome to home.</p>",
						links: ["https://example.com/about"],
					}),
				},
				"https://example.com/about": {
					html: createTestHtml({
						title: "About Us",
						content: "<p>About page content.</p>",
						links: ["https://example.com/team"],
					}),
				},
				"https://example.com/team": {
					html: createTestHtml({
						title: "Our Team",
						content: "<p>Team page content.</p>",
						links: [],
					}),
				},
			});

			const config = { ...getDefaultConfig(), maxDepth: 2 };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			const indexContent = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			expect(indexContent.totalPages).toBe(3);
			expect(indexContent.pages.map((p: { url: string }) => p.url)).toContain(
				"https://example.com",
			);
			expect(indexContent.pages.map((p: { url: string }) => p.url)).toContain(
				"https://example.com/about",
			);
			expect(indexContent.pages.map((p: { url: string }) => p.url)).toContain(
				"https://example.com/team",
			);

			const homePage = indexContent.pages.find(
				(p: { url: string }) => p.url === "https://example.com",
			);
			expect(homePage.depth).toBe(0);

			const teamPage = indexContent.pages.find(
				(p: { url: string }) => p.url === "https://example.com/team",
			);
			expect(teamPage.depth).toBe(2);
		});

		it("should respect sameDomain option", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
						links: ["https://example.com/page1", "https://other-site.com/external"],
					}),
				},
				"https://example.com/page1": {
					html: createTestHtml({
						title: "Page 1",
						content: "<p>Page 1 content.</p>",
					}),
				},
				"https://other-site.com/external": {
					html: createTestHtml({
						title: "External",
						content: "<p>External content.</p>",
					}),
				},
			});

			const config = { ...getDefaultConfig(), sameDomain: true };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			const indexContent = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			expect(indexContent.totalPages).toBe(2);
			const urls = indexContent.pages.map((p: { url: string }) => p.url);
			expect(urls).toContain("https://example.com");
			expect(urls).toContain("https://example.com/page1");
			expect(urls).not.toContain("https://other-site.com/external");
		});

		it("should handle fetch errors gracefully", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
						links: ["https://example.com/error-page"],
					}),
				},
			});

			const crawler = new Crawler(getDefaultConfig(), mockFetcher);
			await crawler.run();

			const indexContent = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			expect(indexContent.totalPages).toBe(1);
		});
	});

	describe("Depth control", () => {
		it("should respect maxDepth option", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Depth 0",
						content: "<p>Root page</p>",
						links: ["https://example.com/level1"],
					}),
				},
				"https://example.com/level1": {
					html: createTestHtml({
						title: "Depth 1",
						content: "<p>Level 1 page</p>",
						links: ["https://example.com/level2"],
					}),
				},
				"https://example.com/level2": {
					html: createTestHtml({
						title: "Depth 2",
						content: "<p>Level 2 page</p>",
					}),
				},
			});

			const config = { ...getDefaultConfig(), maxDepth: 1 };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			const indexContent = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			expect(indexContent.totalPages).toBe(2);
			expect(indexContent.pages.map((p: { url: string }) => p.url)).not.toContain(
				"https://example.com/level2",
			);
		});
	});

	describe("Diff crawling behavior", () => {
		it("should skip unchanged pages in diff mode", async () => {
			const initialHtml = createTestHtml({
				title: "Home",
				content: "<p>Original content.</p>",
			});

			const mockFetcher1 = new MockFetcher({
				"https://example.com": { html: initialHtml },
			});

			const config1 = { ...getDefaultConfig(), diff: false };
			const crawler1 = new Crawler(config1, mockFetcher1);
			await crawler1.run();

			const index1 = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));
			const originalHash = index1.pages[0].hash;

			const mockFetcher2 = new MockFetcher({
				"https://example.com": { html: initialHtml },
			});

			const config2 = { ...getDefaultConfig(), diff: true };
			const crawler2 = new Crawler(config2, mockFetcher2);
			await crawler2.run();

			const index2 = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			// Skipped pages should be preserved from first crawl
			expect(index2.totalPages).toBe(1);
			expect(index2.pages).toHaveLength(1);
			expect(index2.pages[0].url).toBe("https://example.com");
			expect(index2.pages[0].hash).toBe(originalHash);
			expect(originalHash).toBeDefined();
		});

		it("should merge unchanged pages with changed pages in diff mode", async () => {
			// First crawl: 3 pages
			const mockFetcher1 = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
						links: ["https://example.com/page1", "https://example.com/page2"],
					}),
				},
				"https://example.com/page1": {
					html: createTestHtml({
						title: "Page 1",
						content: "<p>Page 1 content.</p>",
					}),
				},
				"https://example.com/page2": {
					html: createTestHtml({
						title: "Page 2",
						content: "<p>Page 2 content.</p>",
					}),
				},
			});

			const config1 = { ...getDefaultConfig(), diff: false };
			const crawler1 = new Crawler(config1, mockFetcher1);
			await crawler1.run();

			const index1 = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));
			expect(index1.totalPages).toBe(3);

			// Second crawl: only page1 changed
			const mockFetcher2 = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
						links: ["https://example.com/page1", "https://example.com/page2"],
					}),
				},
				"https://example.com/page1": {
					html: createTestHtml({
						title: "Page 1",
						content: "<p>UPDATED Page 1 content.</p>",
					}),
				},
				"https://example.com/page2": {
					html: createTestHtml({
						title: "Page 2",
						content: "<p>Page 2 content.</p>",
					}),
				},
			});

			const config2 = { ...getDefaultConfig(), diff: true };
			const crawler2 = new Crawler(config2, mockFetcher2);
			await crawler2.run();

			const index2 = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			// Should have all 3 pages
			expect(index2.totalPages).toBe(3);
			expect(index2.pages).toHaveLength(3);

			// Changed page should have new hash
			const page1After = index2.pages.find(
				(p: { url: string }) => p.url === "https://example.com/page1",
			);
			const page1Before = index1.pages.find(
				(p: { url: string }) => p.url === "https://example.com/page1",
			);
			expect(page1After.hash).not.toBe(page1Before.hash);

			// Unchanged pages should have old hash
			const homePageAfter = index2.pages.find(
				(p: { url: string }) => p.url === "https://example.com",
			);
			const homePageBefore = index1.pages.find(
				(p: { url: string }) => p.url === "https://example.com",
			);
			expect(homePageAfter.hash).toBe(homePageBefore.hash);

			const page2After = index2.pages.find(
				(p: { url: string }) => p.url === "https://example.com/page2",
			);
			const page2Before = index1.pages.find(
				(p: { url: string }) => p.url === "https://example.com/page2",
			);
			expect(page2After.hash).toBe(page2Before.hash);
		});

		it("should detect changed content in diff mode", async () => {
			const mockFetcher1 = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Original content.</p>",
					}),
				},
			});

			const config1 = { ...getDefaultConfig(), diff: false };
			const crawler1 = new Crawler(config1, mockFetcher1);
			await crawler1.run();

			const index1 = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));
			const originalHash = index1.pages[0].hash;

			const mockFetcher2 = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Updated content.</p>",
					}),
				},
			});

			const config2 = { ...getDefaultConfig(), diff: true };
			const crawler2 = new Crawler(config2, mockFetcher2);
			await crawler2.run();

			const index2 = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			expect(index2.pages[0].hash).not.toBe(originalHash);
		});
	});

	describe("Output file generation", () => {
		it("should generate full.md when merge is enabled", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
						links: ["https://example.com/about"],
					}),
				},
				"https://example.com/about": {
					html: createTestHtml({
						title: "About",
						content: "<p>About content.</p>",
					}),
				},
			});

			const config = { ...getDefaultConfig(), merge: true };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			const fullMdPath = join(testOutputDir, "full.md");
			expect(existsSync(fullMdPath)).toBe(true);

			const fullContent = readFileSync(fullMdPath, "utf-8");
			expect(fullContent).toContain("# Home");
			expect(fullContent).toContain("# About");
			expect(fullContent).toContain("Home content");
			expect(fullContent).toContain("About content");
		});

		it("should generate chunks when chunks is enabled", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content:
							"<p>Home content with enough text to make it substantial for chunking.</p>".repeat(
								10,
							),
					}),
				},
				"https://example.com/about": {
					html: createTestHtml({
						title: "About",
						content:
							"<p>About content with enough text to make it substantial for chunking.</p>".repeat(
								10,
							),
					}),
				},
			});

			const config = { ...getDefaultConfig(), chunks: true, merge: true };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			const chunksDir = join(testOutputDir, "chunks");
			expect(existsSync(chunksDir)).toBe(true);

			const chunkFiles = readdirSync(chunksDir).filter((f) => f.endsWith(".md"));
			expect(chunkFiles.length).toBeGreaterThan(0);

			for (const chunkFile of chunkFiles) {
				const chunkContent = readFileSync(join(chunksDir, chunkFile), "utf-8");
				expect(chunkContent).toMatch(/^# /m);
			}
		});

		it("should skip pages when pages option is false", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
					}),
				},
			});

			const config = { ...getDefaultConfig(), pages: false, merge: true };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			expect(existsSync(join(testOutputDir, "pages", "page-001.md"))).toBe(false);
			expect(existsSync(join(testOutputDir, "full.md"))).toBe(true);
			expect(existsSync(join(testOutputDir, "index.json"))).toBe(true);
		});

		it("should skip merge when merge option is false", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home content.</p>",
					}),
				},
			});

			const config = { ...getDefaultConfig(), merge: false, pages: true };
			const crawler = new Crawler(config, mockFetcher);
			await crawler.run();

			expect(existsSync(join(testOutputDir, "full.md"))).toBe(false);
			expect(existsSync(join(testOutputDir, "pages", "page-001-home.md"))).toBe(true);
		});
	});

	describe("Metadata extraction", () => {
		it("should extract metadata from HTML", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Test Page",
						content: "<p>Content.</p>",
						meta: {
							description: "Test description",
							keywords: "test, keywords",
						},
					}),
				},
			});

			const crawler = new Crawler(getDefaultConfig(), mockFetcher);
			await crawler.run();

			const indexContent = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			expect(indexContent.pages[0].metadata.title).toBe("Test Page");
			expect(indexContent.pages[0].metadata.description).toBe("Test description");
			expect(indexContent.pages[0].metadata.keywords).toBe("test, keywords");
		});
	});

	describe("Link tracking", () => {
		it("should track links found on each page", async () => {
			const mockFetcher = new MockFetcher({
				"https://example.com": {
					html: createTestHtml({
						title: "Home",
						content: "<p>Home.</p>",
						links: [
							"https://example.com/page1",
							"https://example.com/page2",
							"https://external.com/page",
						],
					}),
				},
				"https://example.com/page1": {
					html: createTestHtml({
						title: "Page 1",
						content: "<p>Page 1.</p>",
					}),
				},
				"https://example.com/page2": {
					html: createTestHtml({
						title: "Page 2",
						content: "<p>Page 2.</p>",
					}),
				},
			});

			const crawler = new Crawler(getDefaultConfig(), mockFetcher);
			await crawler.run();

			const indexContent = JSON.parse(readFileSync(join(testOutputDir, "index.json"), "utf-8"));

			const homePage = indexContent.pages.find(
				(p: { url: string }) => p.url === "https://example.com",
			);
			expect(homePage.links).toContain("https://example.com/page1");
			expect(homePage.links).toContain("https://example.com/page2");
			expect(homePage.links).not.toContain("https://external.com/page");
		});
	});
});
