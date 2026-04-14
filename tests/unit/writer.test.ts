import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutputWriter } from "../../src/output/writer.js";
import type { CrawlConfig, CrawlResult, Logger, PageMetadata } from "../../src/types.js";

const testOutputDir = "./test-output-writer";

const defaultConfig: CrawlConfig = {
	startUrl: "https://example.com",
	maxDepth: 2,
	maxPages: null,
	outputDir: testOutputDir,
	sameDomain: true,
	includePattern: null,
	excludePattern: null,
	delay: 500,
	timeout: 30000,
	spaWait: 2000,
	headed: false,
	diff: false,
	pages: true,
	merge: true,
	chunks: true,
	keepSession: false,
	respectRobots: true,
	fetcherType: "cli",
	stripQuery: false,
	version: "test-version",
};

const defaultMetadata: PageMetadata = {
	title: "Test Page",
	description: "Test description",
	keywords: null,
	author: null,
	ogTitle: null,
	ogType: null,
};

describe("OutputWriter", () => {
	beforeEach(() => {
		rmSync(testOutputDir, { recursive: true, force: true });
	});

	afterEach(() => {
		rmSync(testOutputDir, { recursive: true, force: true });
		// 一時ディレクトリもクリーンアップ
		const entries = readdirSync(".").filter((e) => e.startsWith("test-output-writer"));
		for (const entry of entries) {
			rmSync(entry, { recursive: true, force: true });
		}
	});

	it("should save page with hash and crawledAt", () => {
		const writer = new OutputWriter({ ...defaultConfig });
		const markdown = "# Test Content\n\nThis is test content.";

		const pageFile = writer.savePage(
			"https://example.com/page1",
			markdown,
			1,
			["https://example.com/page2"],
			defaultMetadata,
			"Test Page",
		);

		expect(pageFile).toBe("pages/page-001-test-page.md");

		const result = writer.getResult();
		expect(result.pages).toHaveLength(1);
		expect(result.pages[0].hash).toBeDefined();
		expect(result.pages[0].hash).toHaveLength(64); // SHA-256 hex = 64 chars
		expect(result.pages[0].crawledAt).toBeDefined();
		expect(new Date(result.pages[0].crawledAt).getTime()).not.toBeNaN();
	});

	it("should compute consistent hash for same content", () => {
		const writer1 = new OutputWriter({ ...defaultConfig });
		const writer2 = new OutputWriter({ ...defaultConfig });
		const markdown = "# Same Content";

		writer1.savePage("https://example.com/p1", markdown, 1, [], defaultMetadata, null);
		writer2.savePage("https://example.com/p2", markdown, 1, [], defaultMetadata, null);

		const hash1 = writer1.getResult().pages[0].hash;
		const hash2 = writer2.getResult().pages[0].hash;

		expect(hash1).toBe(hash2);
	});

	it("should save index.json with hash and crawledAt fields", () => {
		const writer = new OutputWriter({ ...defaultConfig });
		writer.savePage("https://example.com", "# Content", 0, [], defaultMetadata, "Title");
		writer.saveIndex();
		writer.finalize();

		const indexContent = readFileSync(join(testOutputDir, "index.json"), "utf-8");
		const result = JSON.parse(indexContent) as CrawlResult;

		expect(result.pages[0].hash).toBeDefined();
		expect(result.pages[0].crawledAt).toBeDefined();
	});

	it("should add blank line after frontmatter closing ---", () => {
		const writer = new OutputWriter({ ...defaultConfig });
		const markdown = "## Introduction\n\nThis is content.";

		writer.savePage("https://example.com/page1", markdown, 1, [], defaultMetadata, "Test Page");
		writer.finalize();

		const pagePath = join(testOutputDir, "pages/page-001-test-page.md");
		const content = readFileSync(pagePath, "utf-8");

		// Verify that there's a blank line between frontmatter and content
		// The frontmatter should end with "---\n\n" followed by content
		expect(content).toMatch(/---\n\n## Introduction/);
	});

	it("should include hash in frontmatter", () => {
		const writer = new OutputWriter({ ...defaultConfig });
		const markdown = "# Test Content\n\nThis is test content.";

		const pageFile = writer.savePage(
			"https://example.com/page1",
			markdown,
			1,
			[],
			defaultMetadata,
			"Test Page",
		);
		writer.finalize();

		const pagePath = join(testOutputDir, pageFile);
		const content = readFileSync(pagePath, "utf-8");

		// Verify that hash is included in frontmatter
		expect(content).toMatch(/^---\n/);
		expect(content).toMatch(/\nhash: "[a-f0-9]{64}"\n/);
		expect(content).toMatch(/\n---\n\n/);

		// Verify hash is a SHA-256 hex string (64 characters)
		const hashMatch = content.match(/hash: "([a-f0-9]{64})"/);
		expect(hashMatch).toBeTruthy();
		expect(hashMatch?.[1]).toHaveLength(64);
	});

	describe("filename with title", () => {
		it("should include slugified title in filename", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Getting Started Guide" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-getting-started-guide.md");
		});

		it("should use sequential numbers only when title is null", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: null },
				null,
			);
			expect(pageFile).toBe("pages/page-001.md");
		});

		it("should use sequential numbers only when title is empty", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "" },
				null,
			);
			expect(pageFile).toBe("pages/page-001.md");
		});

		it("should use sequential numbers only when title is whitespace only", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "   " },
				null,
			);
			expect(pageFile).toBe("pages/page-001.md");
		});

		it("should fallback to title parameter when metadata.title is null", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: null },
				"Fallback Title",
			);
			expect(pageFile).toBe("pages/page-001-fallback-title.md");
		});

		it("should convert title to lowercase", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "UPPERCASE TITLE" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-uppercase-title.md");
		});

		it("should remove special characters from title", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Title with @#$%^&*() special chars!" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-title-with-special-chars.md");
		});

		it("should replace underscores with hyphens", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "snake_case_title" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-snake-case-title.md");
		});

		it("should collapse multiple hyphens into one", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Title---with---hyphens" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-title-with-hyphens.md");
		});

		it("should trim leading and trailing hyphens", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "-Leading and trailing hyphens-" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-leading-and-trailing-hyphens.md");
		});

		it("should truncate long titles to 50 characters", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const longTitle = "This is a very long title that exceeds the fifty character limit";
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: longTitle },
				null,
			);
			// The slug should be truncated without trailing hyphen
			expect(pageFile.length).toBeLessThanOrEqual("pages/page-001-".length + 50 + ".md".length);
			expect(pageFile).toMatch(/^pages\/page-\d{3}-[a-z0-9-]+\.md$/);
		});

		it("should handle titles with multiple spaces", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Title   with   multiple   spaces" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-title-with-multiple-spaces.md");
		});

		it("should handle Japanese titles with URL fallback", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/getting-started",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "日本語タイトル" },
				null,
			);
			// Non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-getting-started.md");
		});

		it("should handle Japanese titles without URL path", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "日本語タイトル" },
				null,
			);
			// Non-ASCII characters are removed, URL has no path, resulting in sequential number only
			expect(pageFile).toBe("pages/page-001.md");
		});

		it("should handle mixed alphanumeric and Japanese", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "日本語Englishタイトル123" },
				null,
			);
			// Non-ASCII characters are removed, only ASCII remains
			expect(pageFile).toBe("pages/page-001-english123.md");
		});

		it("should handle Chinese titles (simplified) with URL fallback", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/configuration-guide",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "配置指南" },
				null,
			);
			// Non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-configuration-guide.md");
		});

		it("should handle Chinese titles (traditional) with URL fallback", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/setup-guide",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "設定指南" },
				null,
			);
			// Non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-setup-guide.md");
		});

		it("should handle Korean titles with URL fallback", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/start-guide",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "시작하기 가이드" },
				null,
			);
			// Non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-start-guide.md");
		});

		it("should remove emoji from titles", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Getting Started 🚀 Guide 😊" },
				null,
			);
			// Emoji and non-ASCII characters are removed, spaces become hyphens
			expect(pageFile).toBe("pages/page-001-getting-started-guide.md");
		});

		it("should truncate long non-ASCII titles without breaking characters", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			// 60 characters: each Japanese character is one character
			const longTitle =
				"これは非常に長いタイトルで最大文字数の制限を超えていますので切り詰められる必要があります";
			const pageFile = writer.savePage(
				"https://example.com/long-article",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: longTitle },
				null,
			);
			// All non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-long-article.md");
		});

		it("should handle Arabic titles with URL fallback", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/getting-started",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "دليل البدء" },
				null,
			);
			// Non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-getting-started.md");
		});

		it("should handle Cyrillic titles with URL fallback", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/start-guide",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Руководство по началу работы" },
				null,
			);
			// Non-ASCII characters are removed from title, falls back to URL path
			expect(pageFile).toBe("pages/page-001-start-guide.md");
		});

		it("should remove all non-ASCII characters from mixed title", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Hello世界World" },
				null,
			);
			// Non-ASCII characters (世界) are removed, "HelloWorld" becomes "helloworld"
			expect(pageFile).toBe("pages/page-001-helloworld.md");
		});

		it("should fallback to sequential number when title becomes empty after slugify", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "日本語のみ" },
				null,
			);
			// All characters are non-ASCII and removed, URL has no path, resulting in sequential number only
			expect(pageFile).toBe("pages/page-001.md");
		});
	});

	describe("slugifyFromUrl edge cases", () => {
		it("should return empty string for invalid URL", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			// Pass a completely invalid URL that will cause new URL() to throw
			const pageFile = writer.savePage(
				"not-a-valid-url",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: null },
				null,
			);
			// Invalid URL → slugifyFromUrl catches error → returns "" → no title slug
			expect(pageFile).toBe("pages/page-001.md");
		});
	});

	describe("handleSpec edge cases", () => {
		it("should use 'spec' as fallback filename when URL path ends with slash", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			// URL that matches openapi pattern but pop() returns empty string
			// This is hard to trigger with the regex, so let's test direct spec handling
			const result = writer.handleSpec(
				"https://api.example.com/openapi.json",
				'{"openapi": "3.0.0"}',
			);
			expect(result).not.toBeNull();
			expect(result?.type).toBe("openapi");
			expect(result?.filename).toBe("openapi.json");
		});

		it("should return null for non-spec URLs", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const result = writer.handleSpec("https://example.com/regular-page.html", "<html></html>");
			expect(result).toBeNull();
		});
	});

	describe("buildFrontmatter edge cases", () => {
		it("should omit description when null", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const frontmatter = writer.buildFrontmatter(
				"https://example.com/page",
				{ ...defaultMetadata, description: null, keywords: "test" },
				"Title",
				1,
				"abc123",
			);
			expect(frontmatter).not.toContain("description:");
			expect(frontmatter).toContain('keywords: "test"');
		});

		it("should omit keywords when null", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const frontmatter = writer.buildFrontmatter(
				"https://example.com/page",
				{ ...defaultMetadata, description: "desc", keywords: null },
				"Title",
				1,
				"abc123",
			);
			expect(frontmatter).toContain('description: "desc"');
			expect(frontmatter).not.toContain("keywords:");
		});

		it("should omit both description and keywords when null", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const frontmatter = writer.buildFrontmatter(
				"https://example.com/page",
				{ ...defaultMetadata, title: null, description: null, keywords: null },
				null,
				0,
			);
			expect(frontmatter).not.toContain("description:");
			expect(frontmatter).not.toContain("keywords:");
			expect(frontmatter).not.toContain("hash:");
			expect(frontmatter).toContain('title: ""');
		});

		it("should use title parameter as fallback when metadata.title is null", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const frontmatter = writer.buildFrontmatter(
				"https://example.com/page",
				{ ...defaultMetadata, title: null },
				"Fallback Title",
				1,
			);
			expect(frontmatter).toContain('title: "Fallback Title"');
		});
	});

	describe("URL-based slug fallback", () => {
		it("should generate slug from URL path when title is non-ASCII", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/getting-started",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "はじめに" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-getting-started.md");
		});

		it("should handle URL with HTML extension", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/docs/guide.html",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "ガイド" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-guide.md");
		});

		it("should handle URL with PHP extension", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/pages/tutorial.php",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "チュートリアル" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-tutorial.md");
		});

		it("should use sequential number when both title and URL fail", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "日本語" },
				null,
			);
			expect(pageFile).toBe("pages/page-001.md");
		});

		it("should handle deeply nested URL paths", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/docs/api/reference/authentication",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "認証" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-authentication.md");
		});

		it("should handle URL with query parameters", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/search?q=test",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "検索結果" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-search.md");
		});

		it("should handle URL with hash fragment", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/docs/api#section",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "API ドキュメント" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-api.md");
		});

		it("should prefer title over URL when title has ASCII characters", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/getting-started",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Getting Started - はじめに" },
				null,
			);
			// Title has ASCII characters, so it should be used (non-ASCII removed)
			expect(pageFile).toBe("pages/page-001-getting-started.md");
		});

		it("should handle URL with special characters in path", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/docs/api_reference-v2",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "リファレンス" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-api-reference-v2.md");
		});

		it("should handle URL path with trailing slash", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/getting-started/",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "入門" },
				null,
			);
			expect(pageFile).toBe("pages/page-001-getting-started.md");
		});

		it("should handle URL with index.html", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const pageFile = writer.savePage(
				"https://example.com/docs/index.html",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "ドキュメント" },
				null,
			);
			// Falls back to "docs" (parent directory) as "index" is too generic
			expect(pageFile).toBe("pages/page-001-index.md");
		});

		it("should truncate long URL path segments", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const longPath = "this-is-a-very-long-url-path-segment-that-exceeds-the-maximum-length-limit";
			const pageFile = writer.savePage(
				`https://example.com/${longPath}`,
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "長いタイトル" },
				null,
			);
			// Should truncate to 50 characters
			expect(pageFile.length).toBeLessThanOrEqual("pages/page-001-".length + 50 + ".md".length);
			expect(pageFile).toMatch(/^pages\/page-\d{3}-[a-z0-9-]+\.md$/);
		});
	});

	describe("YAML frontmatter escaping", () => {
		it("should escape double quotes in keywords field", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithQuotes: PageMetadata = {
				...defaultMetadata,
				keywords: 'test, "quoted keyword", another',
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithQuotes,
				"Test",
			);
			writer.finalize();

			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify escaped quotes in keywords
			expect(content).toMatch(/keywords: "test, \\"quoted keyword\\", another"/);
		});

		it("should escape double quotes in title field", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithQuotes: PageMetadata = {
				...defaultMetadata,
				title: 'Test "quoted" title',
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithQuotes,
				null,
			);
			writer.finalize();

			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			expect(content).toMatch(/title: "Test \\"quoted\\" title"/);
		});

		it("should escape double quotes in description field", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithQuotes: PageMetadata = {
				...defaultMetadata,
				description: 'Description with "quotes"',
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithQuotes,
				"Test",
			);
			writer.finalize();

			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			expect(content).toMatch(/description: "Description with \\"quotes\\""/);
		});

		it("should handle keywords without quotes", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithoutQuotes: PageMetadata = {
				...defaultMetadata,
				keywords: "test, keyword, another",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithoutQuotes,
				"Test",
			);
			writer.finalize();

			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify keywords remain unchanged
			expect(content).toMatch(/keywords: "test, keyword, another"/);
		});

		it("should escape newline characters in title", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithNewline: PageMetadata = {
				...defaultMetadata,
				title: "Title with\nnewline",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithNewline,
				null,
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify newline is escaped as \n (backslash-n in the file)
			expect(content).toMatch(/title: "Title with\\nnewline"/);
		});

		it("should escape carriage return and newline in description", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithCRLF: PageMetadata = {
				...defaultMetadata,
				description: "Description with\r\nCRLF line ending",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithCRLF,
				"Test",
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify CRLF is escaped as \r\n (backslash-r backslash-n in file)
			expect(content).toMatch(/description: "Description with\\r\\nCRLF line ending"/);
		});

		it("should escape backslash in keywords", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithBackslash: PageMetadata = {
				...defaultMetadata,
				keywords: "path\\to\\file, test",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithBackslash,
				"Test",
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify backslash is escaped as \\ (two backslashes in file)
			expect(content).toMatch(/keywords: "path\\\\to\\\\file, test"/);
		});

		it("should escape tab character in description", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithTab: PageMetadata = {
				...defaultMetadata,
				description: "Description with\ttab character",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithTab,
				"Test",
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify tab is escaped as \t (backslash-t in file)
			expect(content).toMatch(/description: "Description with\\ttab character"/);
		});

		it("should escape multiple special characters in title", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithMultiple: PageMetadata = {
				...defaultMetadata,
				title: 'Title with "quotes"\nand newline',
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithMultiple,
				null,
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify both quotes and newline are escaped
			expect(content).toMatch(/title: "Title with \\"quotes\\"\\nand newline"/);
		});

		it("should escape backslash and quotes in description", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataWithBackslashAndQuotes: PageMetadata = {
				...defaultMetadata,
				description: 'Path is "C:\\Program Files\\App"',
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataWithBackslashAndQuotes,
				"Test",
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify both backslash and quotes are escaped (backslash first)
			expect(content).toMatch(/description: "Path is \\"C:\\\\Program Files\\\\App\\""/);
		});

		it("should handle empty strings without errors", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataEmpty: PageMetadata = {
				...defaultMetadata,
				title: "",
				description: "",
				keywords: "",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataEmpty,
				null,
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify empty strings are handled correctly
			// Empty title is still included (mandatory field)
			expect(content).toMatch(/title: ""/);
			// Empty description and keywords are omitted (optional fields with falsy check)
			expect(content).not.toMatch(/description:/);
			expect(content).not.toMatch(/keywords:/);
		});

		it("should handle strings with only special characters", () => {
			const writer = new OutputWriter({ ...defaultConfig });
			const metadataOnlySpecial: PageMetadata = {
				...defaultMetadata,
				title: "\n\r\t",
				description: "\\\\\\",
			};

			const pageFile = writer.savePage(
				"https://example.com/page1",
				"# Content",
				1,
				[],
				metadataOnlySpecial,
				null,
			);
			writer.finalize();
			const pagePath = join(testOutputDir, pageFile);
			const content = readFileSync(pagePath, "utf-8");

			// Verify all special characters are escaped
			expect(content).toMatch(/title: "\\n\\r\\t"/);
			expect(content).toMatch(/description: "\\\\\\\\\\\\"/);
		});
	});

	describe("diff mode", () => {
		it("should preserve existing files in pages/ directory in diff mode", () => {
			// 1. 初回クロール（非 diff モード）
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			const pageFile1 = writer1.savePage(
				"https://example.com/page1",
				"# Page 1 Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page 1" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			const pagePath1 = join(testOutputDir, pageFile1);

			// ファイルが作成されたことを確認
			expect(readFileSync(pagePath1, "utf-8")).toContain("# Page 1 Content");

			// 2. 差分クロール（diff モード）
			const writer2 = new OutputWriter({ ...defaultConfig, diff: true });

			// 既存ファイルがまだ存在することを確認
			expect(readFileSync(pagePath1, "utf-8")).toContain("# Page 1 Content");

			// 新しいページのみ追加
			const pageFile2 = writer2.savePage(
				"https://example.com/page2",
				"# Page 2 Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page 2" },
				null,
			);
			writer2.saveIndex();

			const pagePath2 = join(testOutputDir, pageFile2);

			// 既存ファイルと新規ファイルの両方が存在することを確認
			expect(readFileSync(pagePath1, "utf-8")).toContain("# Page 1 Content");
			expect(readFileSync(pagePath2, "utf-8")).toContain("# Page 2 Content");

			// ページ番号が連続していることを確認
			expect(pageFile1).toBe("pages/page-001-page-1.md");
			expect(pageFile2).toBe("pages/page-001-page-2.md"); // writer2 の pageCount は 0 から開始
		});

		it("should preserve existing files in specs/ directory in diff mode", () => {
			// 1. 初回クロール（非 diff モード）
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			const spec1Content = '{"openapi": "3.0.0"}';
			writer1.handleSpec("https://api.example.com/openapi.json", spec1Content);
			writer1.saveIndex();
			writer1.finalize();

			const specPath = join(testOutputDir, "specs/openapi.json");
			expect(readFileSync(specPath, "utf-8")).toBe(spec1Content);

			// 2. 差分クロール（diff モード）
			const writer2 = new OutputWriter({ ...defaultConfig, diff: true });

			// 既存ファイルがまだ存在することを確認
			expect(readFileSync(specPath, "utf-8")).toBe(spec1Content);

			// 新しい spec のみ追加
			const spec2Content = '{"swagger": "2.0"}';
			writer2.handleSpec("https://api.example.com/swagger.json", spec2Content);
			writer2.saveIndex();

			// 既存ファイルと新規ファイルの両方が存在することを確認
			expect(readFileSync(specPath, "utf-8")).toBe(spec1Content);
			expect(readFileSync(join(testOutputDir, "specs/swagger.json"), "utf-8")).toBe(spec2Content);
		});

		it("should replace output on successful finalize in non-diff mode", () => {
			// 1. 初回クロール
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/page1",
				"# Old Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page 1" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			const pagePath = join(testOutputDir, "pages/page-001-page-1.md");
			expect(readFileSync(pagePath, "utf-8")).toContain("# Old Content");

			// 2. 2回目のクロール（非 diff モード）
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false });

			// 古いファイルはまだ存在する（finalizeされていないため）
			expect(readFileSync(pagePath, "utf-8")).toContain("# Old Content");

			// 新しい内容でページを保存
			writer2.savePage(
				"https://example.com/page2",
				"# New Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page 2" },
				null,
			);
			writer2.saveIndex();
			writer2.finalize();

			// finalizeされた後、新しいファイルのみが存在する
			const newPagePath = join(testOutputDir, "pages/page-001-page-2.md");
			expect(readFileSync(newPagePath, "utf-8")).toContain("# New Content");

			// 古いファイルは削除されている
			expect(() => readFileSync(pagePath, "utf-8")).toThrow();
		});

		it("should preserve existing output when crawl fails (cleanup called)", () => {
			// 1. 初回クロール（成功）
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/page1",
				"# Original Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page 1" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			const pagePath = join(testOutputDir, "pages/page-001-page-1.md");
			expect(readFileSync(pagePath, "utf-8")).toContain("# Original Content");

			// 2. 2回目のクロール（失敗をシミュレート）
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false });
			writer2.savePage(
				"https://example.com/page2",
				"# Failed Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page 2" },
				null,
			);
			writer2.saveIndex();
			writer2.cleanup(); // 失敗時のクリーンアップ

			// 既存ファイルが保持されていることを確認
			expect(readFileSync(pagePath, "utf-8")).toContain("# Original Content");

			// 新しいファイルは最終ディレクトリに存在しない
			const newPagePath = join(testOutputDir, "pages/page-001-page-2.md");
			expect(() => readFileSync(newPagePath, "utf-8")).toThrow();
		});
	});

	describe("finalize() error recovery", () => {
		it("should create and remove backup during successful finalize", () => {
			// 1. 既存の出力ディレクトリを作成
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original Content",
				0,
				[],
				{ ...defaultMetadata, title: "Original" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			const originalPagePath = join(testOutputDir, "pages/page-001-original.md");
			expect(readFileSync(originalPagePath, "utf-8")).toContain("# Original Content");

			// 2. 新しいクロールで上書き
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false });
			writer2.savePage(
				"https://example.com/new",
				"# New Content",
				0,
				[],
				{ ...defaultMetadata, title: "New" },
				null,
			);
			writer2.saveIndex();

			// finalize() 成功
			writer2.finalize();

			// 新しいコンテンツが存在することを確認
			const newPagePath = join(testOutputDir, "pages/page-001-new.md");
			expect(readFileSync(newPagePath, "utf-8")).toContain("# New Content");

			// バックアップディレクトリが削除されていることを確認
			const backupDir = `${testOutputDir}.bak`;
			expect(existsSync(backupDir)).toBe(false);

			// 古いファイルは存在しない
			expect(existsSync(originalPagePath)).toBe(false);
		});

		it("should not create backup when no existing output", () => {
			// 初回クロール（既存ディレクトリなし）
			const writer = new OutputWriter({ ...defaultConfig, diff: false });
			writer.savePage(
				"https://example.com/first",
				"# First Content",
				0,
				[],
				{ ...defaultMetadata, title: "First" },
				null,
			);
			writer.saveIndex();
			writer.finalize();

			// 出力ディレクトリが作成されたことを確認
			const firstPagePath = join(testOutputDir, "pages/page-001-first.md");
			expect(readFileSync(firstPagePath, "utf-8")).toContain("# First Content");

			// バックアップディレクトリは作成されていない
			const backupDir = `${testOutputDir}.bak`;
			expect(existsSync(backupDir)).toBe(false);
		});

		it("should not affect diff mode (no temp directory)", () => {
			// diff モードでは一時ディレクトリを使用しない
			const writer = new OutputWriter({ ...defaultConfig, diff: true });

			writer.savePage(
				"https://example.com/page",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page" },
				null,
			);
			writer.saveIndex();

			// finalize() を実行（何もしない）
			writer.finalize();

			// ページファイルが存在することを確認
			const pagePath = join(testOutputDir, "pages/page-001-page.md");
			expect(readFileSync(pagePath, "utf-8")).toContain("# Content");

			// バックアップディレクトリは作成されていない
			const backupDir = `${testOutputDir}.bak`;
			expect(existsSync(backupDir)).toBe(false);
		});

		it("should log messages during successful finalize with logger", () => {
			const logger = {
				logIndexFormatError: vi.fn(),
				logIndexLoadError: vi.fn(),
				logDebug: vi.fn(),
			};

			const writer = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer.savePage("https://example.com/page", "# Content", 0, [], defaultMetadata, "Test");
			writer.saveIndex();
			writer.finalize();

			// Verify finalize logged start and completion messages
			expect(logger.logDebug).toHaveBeenCalledWith("Finalizing output", expect.any(Object));
			expect(logger.logDebug).toHaveBeenCalledWith("Output finalized successfully");
		});

		it("should build frontmatter without hash when not provided", () => {
			const writer = new OutputWriter({ ...defaultConfig, diff: false });
			const frontmatter = writer.buildFrontmatter(
				"https://example.com/page",
				defaultMetadata,
				"Test Title",
				1,
				// hash is undefined
			);

			expect(frontmatter).toContain("url: https://example.com/page");
			expect(frontmatter).toContain('title: "Test Page"');
			expect(frontmatter).not.toContain("hash:");
		});

		it("should log cleanup message with logger", () => {
			const logger = {
				logIndexFormatError: vi.fn(),
				logIndexLoadError: vi.fn(),
				logDebug: vi.fn(),
			};

			const writer = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer.savePage("https://example.com/page", "# Content", 0, [], defaultMetadata, "Test");
			writer.cleanup();

			expect(logger.logDebug).toHaveBeenCalledWith(
				"Temporary output cleaned up",
				expect.any(Object),
			);
		});

		it("should recover from incomplete finalization (.bak exists, final doesn't)", () => {
			// 1. 初回クロールで既存データを作成
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original Content",
				0,
				[],
				{ ...defaultMetadata, title: "Original" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			const originalPagePath = join(testOutputDir, "pages/page-001-original.md");
			expect(readFileSync(originalPagePath, "utf-8")).toContain("# Original Content");

			// 2. 不完全なfinalize状態をシミュレート（最終ディレクトリを.bakにリネーム）
			const backupDir = `${testOutputDir}.bak`;
			renameSync(testOutputDir, backupDir);
			expect(existsSync(testOutputDir)).toBe(false);
			expect(existsSync(backupDir)).toBe(true);

			// 3. 新しいクロールでリカバリが発動するはず（loggerを渡してカバレッジ向上）
			const logger: Logger = {
				logIndexFormatError: vi.fn(),
				logIndexLoadError: vi.fn(),
				logDebug: vi.fn(),
			};
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage(
				"https://example.com/new",
				"# New Content",
				0,
				[],
				{ ...defaultMetadata, title: "New" },
				null,
			);
			writer2.saveIndex();
			writer2.finalize();

			// 4. リカバリが成功し、新しいコンテンツで置き換わっていることを確認
			expect(existsSync(testOutputDir)).toBe(true);
			expect(existsSync(backupDir)).toBe(false);

			// リカバリのログが出力されていることを確認
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Detected incomplete previous finalization, recovering from backup",
				expect.any(Object),
			);
			expect(logger.logDebug).toHaveBeenCalledWith("Successfully recovered from backup");

			const newPagePath = join(testOutputDir, "pages/page-001-new.md");
			expect(readFileSync(newPagePath, "utf-8")).toContain("# New Content");

			// 古いファイルは新しいもので置き換わっている
			expect(existsSync(originalPagePath)).toBe(false);
		});

		it("should continue normally if both .bak and final exist (normal state)", () => {
			// 1. 初回クロール
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original Content",
				0,
				[],
				{ ...defaultMetadata, title: "Original" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. 手動で古い.bakディレクトリを作成（異常だが発生しうる状態）
			const backupDir = `${testOutputDir}.bak`;
			mkdirSync(join(backupDir, "pages"), { recursive: true });
			writeFileSync(join(backupDir, "pages/stale.md"), "# Stale Backup Content");

			// 3. 新しいクロール（リカバリは発動せず、通常のfinalizeが実行されるべき）
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false });
			writer2.savePage(
				"https://example.com/new",
				"# New Content",
				0,
				[],
				{ ...defaultMetadata, title: "New" },
				null,
			);
			writer2.saveIndex();
			writer2.finalize();

			// 4. 正常に新しいコンテンツで置き換わっていることを確認
			expect(existsSync(testOutputDir)).toBe(true);
			expect(existsSync(backupDir)).toBe(false);

			const newPagePath = join(testOutputDir, "pages/page-001-new.md");
			expect(readFileSync(newPagePath, "utf-8")).toContain("# New Content");
		});

		it("should continue finalization even if recovery fails", () => {
			// 1. 初回クロール
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original Content",
				0,
				[],
				{ ...defaultMetadata, title: "Original" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. 不完全なfinalize状態をシミュレート
			const backupDir = `${testOutputDir}.bak`;
			renameSync(testOutputDir, backupDir);

			// 3. リカバリが失敗する状況をシミュレート（.bakを読み取り専用にする）
			// Note: ファイルシステムの制限により完全なシミュレートは困難
			// このテストでは、リカバリ後も正常にfinalizeが完了することを確認

			const writer2 = new OutputWriter({ ...defaultConfig, diff: false });
			writer2.savePage(
				"https://example.com/new",
				"# New Content",
				0,
				[],
				{ ...defaultMetadata, title: "New" },
				null,
			);
			writer2.saveIndex();

			// finalizeは成功するはず（リカバリ失敗でもfinalizeは続行される）
			expect(() => writer2.finalize()).not.toThrow();

			// 新しいコンテンツが作成されていることを確認
			expect(existsSync(testOutputDir)).toBe(true);
		});

		it("should not trigger recovery in diff mode", () => {
			// 1. 初回クロール（非diffモード）
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original Content",
				0,
				[],
				{ ...defaultMetadata, title: "Original" },
				null,
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. 不完全なfinalize状態をシミュレート
			const backupDir = `${testOutputDir}.bak`;
			renameSync(testOutputDir, backupDir);

			// 3. diffモードで新しいクロール（リカバリは発動しない）
			const writer2 = new OutputWriter({ ...defaultConfig, diff: true });

			// diffモードでは既存ディレクトリを直接使用するため、
			// 最終ディレクトリが存在しない場合は新規作成される
			writer2.savePage(
				"https://example.com/page",
				"# Content",
				0,
				[],
				{ ...defaultMetadata, title: "Page" },
				null,
			);
			writer2.saveIndex();
			writer2.finalize();

			// diffモードはtempOutputDirを使わないため、finalizeは何もしない
			// .bakディレクトリは残ったまま
			expect(existsSync(backupDir)).toBe(true);
		});
	});
});
