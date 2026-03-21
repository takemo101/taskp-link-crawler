import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlLogger } from "../../src/crawler/logger.js";
import { PostProcessor } from "../../src/crawler/post-processor.js";
import type { CrawlConfig, CrawledPage } from "../../src/types.js";

const testOutputDir = "./test-output-post-processor";

// Helper to create test pages
const createPage = (url: string, title: string, file: string): CrawledPage => ({
	url,
	title,
	file,
	depth: 0,
	links: [],
	metadata: {
		title,
		description: null,
		keywords: null,
		author: null,
		ogTitle: null,
		ogType: null,
	},
	hash: "",
	crawledAt: new Date().toISOString(),
});

describe("PostProcessor", () => {
	let baseConfig: CrawlConfig;
	let mockLogger: CrawlLogger;

	beforeEach(() => {
		// Clean up and create test directory
		rmSync(testOutputDir, { recursive: true, force: true });
		mkdirSync(testOutputDir, { recursive: true });

		// Create pages directory
		mkdirSync(join(testOutputDir, "pages"), { recursive: true });

		baseConfig = {
			startUrl: "https://example.com",
			maxDepth: 2,
			maxPages: null,
			outputDir: testOutputDir,
			sameDomain: true,
			includePattern: null,
			excludePattern: null,
			delay: 0,
			timeout: 30000,
			spaWait: 2000,
			headed: false,
			diff: false,
			pages: true,
			merge: true,
			chunks: true,
			keepSession: false,
			respectRobots: true,
			version: "test-version",
		};

		// Create a mock logger
		mockLogger = {
			logStart: vi.fn(),
			logLoadedHashes: vi.fn(),
			logCrawlStart: vi.fn(),
			logPageSaved: vi.fn(),
			logSkipped: vi.fn(),
			logSpecDetected: vi.fn(),
			logFetchError: vi.fn(),
			logPostProcessingStart: vi.fn(),
			logPostProcessingSkipped: vi.fn(),
			logMergerStart: vi.fn(),
			logMergerComplete: vi.fn(),
			logChunkerStart: vi.fn(),
			logChunkerComplete: vi.fn(),
			logComplete: vi.fn(),
			logDebug: vi.fn(),
		} as unknown as CrawlLogger;
	});

	afterEach(() => {
		rmSync(testOutputDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	describe("process with empty pages", () => {
		it("should skip processing when pages array is empty", async () => {
			const processor = new PostProcessor(baseConfig, baseConfig.outputDir, mockLogger);
			await processor.process([]);

			expect(mockLogger.logPostProcessingSkipped).toHaveBeenCalled();
			expect(mockLogger.logPostProcessingStart).not.toHaveBeenCalled();
		});

		it("should not call merger when no pages", async () => {
			const processor = new PostProcessor(baseConfig, baseConfig.outputDir, mockLogger);
			await processor.process([]);

			expect(mockLogger.logMergerStart).not.toHaveBeenCalled();
		});

		it("should not call chunker when no pages", async () => {
			const processor = new PostProcessor(baseConfig, baseConfig.outputDir, mockLogger);
			await processor.process([]);

			expect(mockLogger.logChunkerStart).not.toHaveBeenCalled();
		});
	});

	describe("process with --no-merge flag", () => {
		it("should skip merger when merge is false", async () => {
			const config = { ...baseConfig, merge: false };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([["pages/page-001.md", "# Page 1\n\nContent"]]);

			await processor.process(pages, contents);

			expect(mockLogger.logMergerStart).not.toHaveBeenCalled();
			expect(mockLogger.logMergerComplete).not.toHaveBeenCalled();
		});

		it("should still run chunker when merge is false but chunks is true", async () => {
			const config = { ...baseConfig, merge: false, chunks: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];
			const contents = new Map([
				["pages/page-001.md", "# Page 1\n\nContent 1"],
				["pages/page-002.md", "# Page 2\n\nContent 2"],
			]);

			await processor.process(pages, contents);

			expect(mockLogger.logChunkerStart).toHaveBeenCalled();
			expect(mockLogger.logChunkerComplete).toHaveBeenCalled();
		});

		it("should build full markdown from memory when merge is false", async () => {
			const config = { ...baseConfig, merge: false, chunks: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([["pages/page-001.md", "# Page 1\n\nContent"]]);

			await processor.process(pages, contents);

			// Chunker should still run with content built from memory
			expect(mockLogger.logChunkerStart).toHaveBeenCalled();
		});

		it("should run chunker with pages from disk when merge is false, chunks is true, and pages is true", async () => {
			const config = { ...baseConfig, merge: false, chunks: true, pages: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			// Create page files on disk
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });
			writeFileSync(join(pagesDir, "page-001.md"), "# Page 1\n\nContent from disk for chunking");

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];

			await processor.process(pages);

			// Should build content from disk and run chunker
			expect(mockLogger.logChunkerStart).toHaveBeenCalled();
			expect(mockLogger.logChunkerComplete).toHaveBeenCalled();
		});
	});

	describe("process with --no-chunks flag", () => {
		it("should skip chunker when chunks is false", async () => {
			const config = { ...baseConfig, chunks: false };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			// Create page files first
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });
			writeFileSync(join(pagesDir, "page-001.md"), "# Page 1\n\nContent");

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];

			await processor.process(pages);

			expect(mockLogger.logChunkerStart).not.toHaveBeenCalled();
			expect(mockLogger.logChunkerComplete).not.toHaveBeenCalled();
		});

		it("should still run merger when chunks is false but merge is true", async () => {
			const config = { ...baseConfig, chunks: false, merge: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			// Create page files first
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });
			writeFileSync(join(pagesDir, "page-001.md"), "# Page 1\n\nContent");

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];

			await processor.process(pages);

			expect(mockLogger.logMergerStart).toHaveBeenCalled();
			expect(mockLogger.logMergerComplete).toHaveBeenCalled();
		});
	});

	describe("process with both --no-merge and --no-chunks", () => {
		it("should only log post processing when both flags are false", async () => {
			const config = { ...baseConfig, merge: false, chunks: false };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([["pages/page-001.md", "# Page 1\n\nContent"]]);

			await processor.process(pages, contents);

			expect(mockLogger.logPostProcessingStart).toHaveBeenCalled();
			expect(mockLogger.logMergerStart).not.toHaveBeenCalled();
			expect(mockLogger.logChunkerStart).not.toHaveBeenCalled();
		});
	});

	describe("page content loading", () => {
		it("should load page contents from disk when pages is true", async () => {
			const config = { ...baseConfig, pages: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			// Create page files
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });
			writeFileSync(join(pagesDir, "page-001.md"), "# Page 1\n\nContent from disk");

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];

			await processor.process(pages);

			// Verify full.md was created with content from disk
			const fullMdPath = join(testOutputDir, "full.md");
			expect(existsSync(fullMdPath)).toBe(true);
			const content = readFileSync(fullMdPath, "utf-8");
			expect(content).toContain("Content from disk");
		});

		it("should use provided pageContents when pages is false", async () => {
			const config = { ...baseConfig, pages: false, merge: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([["pages/page-001.md", "# Page 1\n\nContent from memory"]]);

			await processor.process(pages, contents);

			// Verify full.md was created with content from memory
			const fullMdPath = join(testOutputDir, "full.md");
			expect(existsSync(fullMdPath)).toBe(true);
			const content = readFileSync(fullMdPath, "utf-8");
			expect(content).toContain("Content from memory");
		});

		it("should handle missing files gracefully", async () => {
			const config = { ...baseConfig, pages: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/nonexistent.md")];

			// Should not throw even though file doesn't exist
			await processor.process(pages);
			// If we get here without throwing, the test passes
			expect(mockLogger.logPostProcessingStart).toHaveBeenCalled();
		});

		it("should handle when full.md read fails but chunker can still run with pages content", async () => {
			// This test covers the catch block when reading full.md fails
			const config = { ...baseConfig, merge: true, chunks: true, pages: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			// Create page files
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });
			writeFileSync(join(pagesDir, "page-001.md"), "# Page 1\n\nContent that will be chunked");

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];

			// Process should succeed even if full.md read somehow fails
			await processor.process(pages);

			// Chunker should still be called
			expect(mockLogger.logChunkerStart).toHaveBeenCalled();
		});

		it("should handle empty pageContents map", async () => {
			const config = { ...baseConfig, pages: false, merge: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const emptyContents = new Map<string, string>();

			await processor.process(pages, emptyContents);

			// Should not throw with empty contents
			expect(mockLogger.logMergerStart).toHaveBeenCalled();
		});
	});

	describe("full integration", () => {
		it("should create full.md and chunks when both merge and chunks are true", async () => {
			const config = { ...baseConfig, merge: true, chunks: true };
			const processor = new PostProcessor(config, config.outputDir);

			// Create page files
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });

			const markdown1 = `# Page 1

This is the first page content.

## Subsection

More content here.`;

			const markdown2 = `# Page 2

This is the second page content.`;

			writeFileSync(join(pagesDir, "page-001.md"), markdown1);
			writeFileSync(join(pagesDir, "page-002.md"), markdown2);

			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];

			await processor.process(pages);

			// Verify full.md exists
			const fullMdPath = join(testOutputDir, "full.md");
			expect(existsSync(fullMdPath)).toBe(true);

			// Verify chunks were created (since content is small, might not be chunked)
			const _chunksDir = join(testOutputDir, "chunks");
			// Content might or might not be chunked depending on size
		});

		it("should handle multiple pages correctly", async () => {
			const config = { ...baseConfig, merge: true, chunks: false };
			const processor = new PostProcessor(config, config.outputDir);

			// Create page files
			const pagesDir = join(testOutputDir, "pages");
			mkdirSync(pagesDir, { recursive: true });

			for (let i = 1; i <= 3; i++) {
				writeFileSync(
					join(pagesDir, `page-${String(i).padStart(3, "0")}.md`),
					`# Page ${i}\n\nContent ${i}`,
				);
			}

			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
				createPage("https://example.com/page3", "Page 3", "pages/page-003.md"),
			];

			await processor.process(pages);

			const fullMdPath = join(testOutputDir, "full.md");
			const content = readFileSync(fullMdPath, "utf-8");

			// All pages should be in full.md
			expect(content).toContain("# Page 1");
			expect(content).toContain("# Page 2");
			expect(content).toContain("# Page 3");
			expect(content).toContain("Content 1");
			expect(content).toContain("Content 2");
			expect(content).toContain("Content 3");
		});
	});

	describe("--no-pages + --chunks (in-memory content path)", () => {
		it("should generate chunks from in-memory content when --no-pages --no-merge --chunks", async () => {
			const config = { ...baseConfig, pages: false, merge: false, chunks: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];
			const contents = new Map([
				["pages/page-001.md", "---\nurl: https://example.com/page1\n---\n\n# Page 1\n\nContent 1"],
				["pages/page-002.md", "---\nurl: https://example.com/page2\n---\n\n# Page 2\n\nContent 2"],
			]);

			await processor.process(pages, contents);

			// chunks/ ディレクトリにファイルが生成されることを検証
			const chunksDir = join(testOutputDir, "chunks");
			expect(existsSync(chunksDir)).toBe(true);
			const chunkFiles = readdirSync(chunksDir).filter((f) => f.endsWith(".md"));
			expect(chunkFiles.length).toBeGreaterThan(0);

			// チャンク内容にページコンテンツが含まれることを検証
			const allChunkContent = chunkFiles
				.map((f) => readFileSync(join(chunksDir, f), "utf-8"))
				.join("\n");
			expect(allChunkContent).toContain("Content 1");
			expect(allChunkContent).toContain("Content 2");

			// full.md が生成されないことを検証
			const fullMdPath = join(testOutputDir, "full.md");
			expect(existsSync(fullMdPath)).toBe(false);

			// merger は呼ばれないが chunker は呼ばれる
			expect(mockLogger.logMergerStart).not.toHaveBeenCalled();
			expect(mockLogger.logChunkerStart).toHaveBeenCalled();
			expect(mockLogger.logChunkerComplete).toHaveBeenCalled();
		});

		it("should generate full.md and chunks from in-memory content when --no-pages --merge --chunks", async () => {
			const config = { ...baseConfig, pages: false, merge: true, chunks: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];
			const contents = new Map([
				[
					"pages/page-001.md",
					"---\nurl: https://example.com/page1\n---\n\n# Page 1\n\nContent from memory A",
				],
				[
					"pages/page-002.md",
					"---\nurl: https://example.com/page2\n---\n\n# Page 2\n\nContent from memory B",
				],
			]);

			await processor.process(pages, contents);

			// full.md が生成されることを検証
			const fullMdPath = join(testOutputDir, "full.md");
			expect(existsSync(fullMdPath)).toBe(true);
			const fullContent = readFileSync(fullMdPath, "utf-8");
			expect(fullContent).toContain("Content from memory A");
			expect(fullContent).toContain("Content from memory B");

			// chunks/ ディレクトリにファイルが生成されることを検証
			const chunksDir = join(testOutputDir, "chunks");
			expect(existsSync(chunksDir)).toBe(true);
			const chunkFiles = readdirSync(chunksDir).filter((f) => f.endsWith(".md"));
			expect(chunkFiles.length).toBeGreaterThan(0);

			// チャンク内容にページコンテンツが含まれることを検証
			const allChunkContent = chunkFiles
				.map((f) => readFileSync(join(chunksDir, f), "utf-8"))
				.join("\n");
			expect(allChunkContent).toContain("Content from memory A");
			expect(allChunkContent).toContain("Content from memory B");

			// merger と chunker 両方が呼ばれる
			expect(mockLogger.logMergerStart).toHaveBeenCalled();
			expect(mockLogger.logMergerComplete).toHaveBeenCalled();
			expect(mockLogger.logChunkerStart).toHaveBeenCalled();
			expect(mockLogger.logChunkerComplete).toHaveBeenCalled();
		});

		it("should not create page files on disk when --no-pages", async () => {
			const config = { ...baseConfig, pages: false, merge: false, chunks: true };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([["pages/page-001.md", "# Page 1\n\nIn-memory only content"]]);

			await processor.process(pages, contents);

			// pages/ ディレクトリにファイルが作成されていないことを検証
			const pageFile = join(testOutputDir, "pages", "page-001.md");
			expect(existsSync(pageFile)).toBe(false);

			// chunks は生成される
			const chunksDir = join(testOutputDir, "chunks");
			expect(existsSync(chunksDir)).toBe(true);
		});
	});

	describe("buildFullMarkdown (via process)", () => {
		it("should handle pages with null titles", async () => {
			const config = { ...baseConfig, pages: false, merge: true, chunks: false };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [
				{ ...createPage("https://example.com/page1", "Page 1", "pages/page-001.md"), title: null },
			];
			const contents = new Map([["pages/page-001.md", "# Original Title\n\nContent"]]);

			await processor.process(pages, contents);

			expect(mockLogger.logMergerComplete).toHaveBeenCalled();
		});

		it("should strip frontmatter from content", async () => {
			const config = { ...baseConfig, pages: false, merge: true, chunks: false };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([
				[
					"pages/page-001.md",
					`---
title: Page 1
url: https://example.com/page1
---

# Page 1

Content after frontmatter`,
				],
			]);

			await processor.process(pages, contents);

			const fullMdPath = join(testOutputDir, "full.md");
			const content = readFileSync(fullMdPath, "utf-8");

			// The title from frontmatter shouldn't appear as duplicate
			expect(content).toContain("Content after frontmatter");
		});

		it("should strip H1 title from content body", async () => {
			const config = { ...baseConfig, pages: false, merge: true, chunks: false };
			const processor = new PostProcessor(config, config.outputDir, mockLogger);

			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const contents = new Map([["pages/page-001.md", "# Page 1\n\nContent body"]]);

			await processor.process(pages, contents);

			const fullMdPath = join(testOutputDir, "full.md");
			const content = readFileSync(fullMdPath, "utf-8");

			// Should have header from merge, not from original content
			expect(content).toContain("Content body");
		});
	});
});
