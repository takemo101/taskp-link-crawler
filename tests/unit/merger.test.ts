import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Merger } from "../../src/output/merger.js";
import type { CrawledPage } from "../../src/types.js";

const testOutputDir = "./test-output-merger";

const createPage = (url: string, title: string | null, file: string): CrawledPage => ({
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

describe("Merger", () => {
	beforeEach(() => {
		mkdirSync(testOutputDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testOutputDir, { recursive: true, force: true });
	});

	describe("stripTitle", () => {
		it("should remove H1 title from markdown", () => {
			const merger = new Merger();
			const markdown = "# Page Title\n\nSome content here.";

			const result = merger.stripTitle(markdown);

			expect(result).toBe("Some content here.");
		});

		it("should handle markdown without H1", () => {
			const merger = new Merger();
			const markdown = "Some content without title.";

			const result = merger.stripTitle(markdown);

			expect(result).toBe("Some content without title.");
		});

		it("should skip frontmatter and remove H1", () => {
			const merger = new Merger();
			const markdown = `---
url: https://example.com
title: "Test"
---

# Page Title

Content after title.`;

			const result = merger.stripTitle(markdown);

			expect(result).toBe("Content after title.");
		});

		it("should remove multiple blank lines after title", () => {
			const merger = new Merger();
			const markdown = "# Title\n\n\n\nContent";

			const result = merger.stripTitle(markdown);

			expect(result).toBe("Content");
		});
	});

	describe("buildFullContent", () => {
		it("should build full markdown content without writing to file", () => {
			const merger = new Merger();
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map([["pages/page-001.md", "# Page 1\n\nThis is content."]]);

			const result = merger.buildFullContent(pages, pageContents);

			expect(result).toContain("# Page 1");
			expect(result).toContain("> Source: https://example.com/page1");
			expect(result).toContain("This is content.");
		});

		it("should merge multiple pages with separators", () => {
			const merger = new Merger();
			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];
			const pageContents = new Map([
				["pages/page-001.md", "# Page 1\n\nContent 1"],
				["pages/page-002.md", "# Page 2\n\nContent 2"],
			]);

			const result = merger.buildFullContent(pages, pageContents);

			expect(result).toContain("---");
			expect(result).toContain("Content 1");
			expect(result).toContain("Content 2");
			// Should have 1 separator for 2 pages
			const separatorMatches = result.match(/---/g);
			expect(separatorMatches).toHaveLength(1);
		});

		it("should handle empty pages array", () => {
			const merger = new Merger();
			const pages: CrawledPage[] = [];
			const pageContents = new Map<string, string>();

			const result = merger.buildFullContent(pages, pageContents);

			expect(result).toBe("");
		});

		it("should use URL as title when title is null", () => {
			const merger = new Merger();
			const pages = [createPage("https://example.com/page1", null, "pages/page-001.md")];
			const pageContents = new Map([["pages/page-001.md", "# Original Title\n\nContent"]]);

			const result = merger.buildFullContent(pages, pageContents);

			expect(result).toContain("# https://example.com/page1");
			expect(result).toContain("Content");
		});

		it("should strip frontmatter and title from content", () => {
			const merger = new Merger();
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map([
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

			const result = merger.buildFullContent(pages, pageContents);

			expect(result).toContain("# Page 1");
			expect(result).toContain("Content after frontmatter");
			// Should not have duplicate title
			const titleMatches = result.match(/# Page 1/g);
			expect(titleMatches).toHaveLength(1);
		});
	});

	describe("buildFullContent + writeFileSync", () => {
		it("should write full.md file", () => {
			const merger = new Merger();
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map([["pages/page-001.md", "# Page 1\n\nThis is content."]]);

			const fullContent = merger.buildFullContent(pages, pageContents);
			const outputPath = join(testOutputDir, "full.md");
			writeFileSync(outputPath, fullContent);

			expect(outputPath).toBe(join(testOutputDir, "full.md"));
			const content = readFileSync(outputPath, "utf-8");
			expect(content).toContain("# Page 1");
			expect(content).toContain("> Source: https://example.com/page1");
			expect(content).toContain("This is content.");
		});

		it("should merge multiple pages with separators", () => {
			const merger = new Merger();
			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];
			const pageContents = new Map([
				["pages/page-001.md", "# Page 1\n\nContent 1"],
				["pages/page-002.md", "# Page 2\n\nContent 2"],
			]);

			const fullContent = merger.buildFullContent(pages, pageContents);
			const outputPath = join(testOutputDir, "full.md");
			writeFileSync(outputPath, fullContent);

			const content = readFileSync(outputPath, "utf-8");
			expect(content).toContain("---");
			expect(content).toContain("Content 1");
			expect(content).toContain("Content 2");
		});

		it("should handle duplicate titles across pages", () => {
			const merger = new Merger();
			const pages = [
				createPage("https://example.com/page1", "Same Title", "pages/page-001.md"),
				createPage("https://example.com/page2", "Same Title", "pages/page-002.md"),
			];
			const pageContents = new Map([
				["pages/page-001.md", "# Same Title\n\nContent from page 1"],
				["pages/page-002.md", "# Same Title\n\nContent from page 2"],
			]);

			const fullContent = merger.buildFullContent(pages, pageContents);
			const outputPath = join(testOutputDir, "full.md");
			writeFileSync(outputPath, fullContent);

			const content = readFileSync(outputPath, "utf-8");
			// Both pages should be present with their content
			expect(content).toContain("Content from page 1");
			expect(content).toContain("Content from page 2");
			// Headers should appear for both pages
			const headerMatches = content.match(/# Same Title/g);
			expect(headerMatches).toHaveLength(2);
		});

		it("should handle empty content in pageContents", () => {
			const merger = new Merger();
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map<string, string>([]);

			const fullContent = merger.buildFullContent(pages, pageContents);
			const outputPath = join(testOutputDir, "full.md");
			writeFileSync(outputPath, fullContent);

			const content = readFileSync(outputPath, "utf-8");
			expect(content).toContain("# Page 1");
			expect(content).toContain("> Source: https://example.com/page1");
			// Should handle missing content gracefully
			expect(content).not.toContain("undefined");
		});

		it("should handle pages with empty markdown content", () => {
			const merger = new Merger();
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map([["pages/page-001.md", ""]]);

			const fullContent = merger.buildFullContent(pages, pageContents);
			const outputPath = join(testOutputDir, "full.md");
			writeFileSync(outputPath, fullContent);

			const content = readFileSync(outputPath, "utf-8");
			expect(content).toContain("# Page 1");
			expect(content).toContain("> Source: https://example.com/page1");
		});

		it("should handle many pages efficiently", () => {
			const merger = new Merger();
			const pages: CrawledPage[] = [];
			const pageContents = new Map<string, string>();

			for (let i = 1; i <= 10; i++) {
				const file = `pages/page-${String(i).padStart(3, "0")}.md`;
				pages.push(createPage(`https://example.com/page${i}`, `Page ${i}`, file));
				pageContents.set(file, `# Page ${i}\n\nContent ${i}`);
			}

			const fullContent = merger.buildFullContent(pages, pageContents);
			const outputPath = join(testOutputDir, "full.md");
			writeFileSync(outputPath, fullContent);

			const content = readFileSync(outputPath, "utf-8");
			expect(content).toContain("# Page 1");
			expect(content).toContain("# Page 10");
			expect(content).toContain("Content 1");
			expect(content).toContain("Content 10");
			// Should have 9 separators for 10 pages
			const separatorMatches = content.match(/---/g);
			expect(separatorMatches).toHaveLength(9);
		});
	});

	describe("logging missing content", () => {
		it("should log debug message when content is missing from Map", () => {
			const mockLogger = {
				logDebug: vi.fn(),
				logIndexFormatError: vi.fn(),
				logIndexLoadError: vi.fn(),
			};

			const merger = new Merger(mockLogger);
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map<string, string>(); // Empty map

			const result = merger.buildFullContent(pages, pageContents);

			expect(mockLogger.logDebug).toHaveBeenCalledWith(
				"Missing content for page",
				expect.objectContaining({
					file: "pages/page-001.md",
					url: "https://example.com/page1",
				}),
			);
			expect(result).toContain("# Page 1");
		});

		it("should not log when content exists but is empty string", () => {
			const mockLogger = {
				logDebug: vi.fn(),
				logIndexFormatError: vi.fn(),
				logIndexLoadError: vi.fn(),
			};

			const merger = new Merger(mockLogger);
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map([["pages/page-001.md", ""]]); // Empty string but key exists

			const result = merger.buildFullContent(pages, pageContents);

			expect(mockLogger.logDebug).not.toHaveBeenCalled();
			expect(result).toContain("# Page 1");
		});

		it("should work without logger (backward compatibility)", () => {
			const merger = new Merger(); // No logger
			const pages = [createPage("https://example.com/page1", "Page 1", "pages/page-001.md")];
			const pageContents = new Map<string, string>();

			const result = merger.buildFullContent(pages, pageContents);

			// Should not throw error
			expect(result).toContain("# Page 1");
		});

		it("should log for multiple missing pages", () => {
			const mockLogger = {
				logDebug: vi.fn(),
				logIndexFormatError: vi.fn(),
				logIndexLoadError: vi.fn(),
			};

			const merger = new Merger(mockLogger);
			const pages = [
				createPage("https://example.com/page1", "Page 1", "pages/page-001.md"),
				createPage("https://example.com/page2", "Page 2", "pages/page-002.md"),
			];
			const pageContents = new Map<string, string>(); // Empty map

			merger.buildFullContent(pages, pageContents);

			expect(mockLogger.logDebug).toHaveBeenCalledTimes(2);
			expect(mockLogger.logDebug).toHaveBeenCalledWith(
				"Missing content for page",
				expect.objectContaining({ file: "pages/page-001.md" }),
			);
			expect(mockLogger.logDebug).toHaveBeenCalledWith(
				"Missing content for page",
				expect.objectContaining({ file: "pages/page-002.md" }),
			);
		});
	});
});
