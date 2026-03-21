import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlConfig, Fetcher, FetchResult } from "../../src/types.js";

// Force Readability to fail so extractContent() uses the fallback path.
// Issue #745: extractContent() は内部で DOM をクローンするため元の DOM は変更されないが、
// リグレッション防止として、<nav> 内のリンクが確実にクロールされることを検証する。
vi.mock("@mozilla/readability", () => {
	return {
		Readability: class {
			parse(): null {
				return null;
			}
		},
	};
});

// Import AFTER mocking.
const { Crawler } = await import("../../src/crawler/index.js");

class MockFetcher implements Fetcher {
	private responses = new Map<string, FetchResult>();

	setResponse(url: string, result: FetchResult | null): void {
		this.responses.set(url, result as FetchResult);
	}

	async fetch(url: string): Promise<FetchResult | null> {
		return this.responses.get(url) ?? null;
	}

	async close(): Promise<void> {
		// no-op
	}
}

describe("Crawler - link extraction order", () => {
	const testDir = join(fileURLToPath(import.meta.url), "..", ".test-crawler-link-extraction-order");
	let mockFetcher: MockFetcher;
	let baseConfig: CrawlConfig;

	beforeEach(async () => {
		await rm(testDir, { recursive: true, force: true });
		await mkdir(testDir, { recursive: true });

		mockFetcher = new MockFetcher();
		baseConfig = {
			startUrl: "https://example.com",
			maxDepth: 1,
			maxPages: null,
			outputDir: testDir,
			sameDomain: true,
			includePattern: null,
			excludePattern: null,
			delay: 0,
			timeout: 30000,
			spaWait: 0,
			headed: false,
			diff: false,
			pages: true,
			merge: false,
			chunks: false,
			keepSession: false,
			respectRobots: false,
			version: "1.0.0",
		};
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("should crawl links from <nav> even when extractContent() uses fallback path", async () => {
		const rootHtml = `
			<!DOCTYPE html>
			<html>
				<head><title>Root</title></head>
				<body>
					<nav>
						<a href="/page1">Page 1</a>
					</nav>
					<p>Some short content</p>
				</body>
			</html>
		`;

		const page1Html = `
			<!DOCTYPE html>
			<html>
				<head><title>Page 1</title></head>
				<body>
					<p>Content</p>
				</body>
			</html>
		`;

		mockFetcher.setResponse("https://example.com", {
			html: rootHtml,
			finalUrl: "https://example.com",
			contentType: "text/html",
		});
		mockFetcher.setResponse("https://example.com/page1", {
			html: page1Html,
			finalUrl: "https://example.com/page1",
			contentType: "text/html",
		});

		const crawler = new Crawler(baseConfig, mockFetcher);
		await crawler.run();

		const indexPath = join(testDir, "index.json");
		expect(existsSync(indexPath)).toBe(true);

		const indexContent = await readFile(indexPath, "utf-8");
		const indexData = JSON.parse(indexContent);

		expect(indexData.totalPages).toBe(2);
		const urls = indexData.pages.map((p: { url: string }) => p.url);
		expect(urls).toContain("https://example.com");
		expect(urls).toContain("https://example.com/page1");
	});
});
