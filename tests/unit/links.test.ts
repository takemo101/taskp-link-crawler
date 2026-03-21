import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractLinks, isSameDomain, normalizeUrl, shouldCrawl } from "../../src/parser/links.js";
import type { CrawlConfig } from "../../src/types.js";

describe("normalizeUrl", () => {
	it("should normalize absolute URL", () => {
		const result = normalizeUrl("https://example.com/page", "https://example.com");
		expect(result).toBe("https://example.com/page");
	});

	it("should resolve relative URL against base URL", () => {
		const result = normalizeUrl("/about", "https://example.com");
		expect(result).toBe("https://example.com/about");
	});

	it("should resolve relative URL without leading slash", () => {
		const result = normalizeUrl("about", "https://example.com/");
		expect(result).toBe("https://example.com/about");
	});

	it("should remove fragment from URL", () => {
		const result = normalizeUrl("https://example.com/page#section", "https://example.com");
		expect(result).toBe("https://example.com/page");
	});

	it("should handle URL with query string and fragment", () => {
		const result = normalizeUrl("https://example.com/page?q=test#section", "https://example.com");
		expect(result).toBe("https://example.com/page?q=test");
	});

	it("should return null for invalid URL", () => {
		// URL that cannot be parsed even with base URL
		const result = normalizeUrl("http://[invalid", "https://example.com");
		expect(result).toBeNull();
	});

	it("should resolve path-like strings against base URL", () => {
		// Strings that look like paths get resolved against base URL
		const result = normalizeUrl("not a url", "https://example.com");
		expect(result).toBe("https://example.com/not%20a%20url");
	});

	it("should handle protocol-relative URL", () => {
		const result = normalizeUrl("//cdn.example.com/file.js", "https://example.com");
		expect(result).toBe("https://cdn.example.com/file.js");
	});
});

describe("isSameDomain", () => {
	it("should return true for same domain", () => {
		expect(isSameDomain("https://example.com/page", "https://example.com")).toBe(true);
	});

	it("should return true for same domain with different paths", () => {
		expect(isSameDomain("https://example.com/about", "https://example.com/contact")).toBe(true);
	});

	it("should return false for different domain", () => {
		expect(isSameDomain("https://other.com/page", "https://example.com")).toBe(false);
	});

	it("should return false for subdomain", () => {
		expect(isSameDomain("https://sub.example.com", "https://example.com")).toBe(false);
	});

	it("should return false for parent domain", () => {
		expect(isSameDomain("https://example.com", "https://sub.example.com")).toBe(false);
	});

	it("should return false for invalid URL", () => {
		expect(isSameDomain("not a url", "https://example.com")).toBe(false);
	});

	it("should handle URLs with ports", () => {
		// Same hostname, different port - still same domain (hostname comparison only)
		expect(isSameDomain("https://example.com:8080", "https://example.com")).toBe(true);
	});
});

describe("shouldCrawl", () => {
	const baseConfig: CrawlConfig = {
		startUrl: "https://example.com",
		maxDepth: 2,
		maxPages: null,
		outputDir: "./output",
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
		version: "test-version",
	};

	it("should return true for unvisited URL", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/page", visited, baseConfig)).toBe(true);
	});

	it("should return false for visited URL", () => {
		const visited = new Set<string>(["https://example.com/page"]);
		expect(shouldCrawl("https://example.com/page", visited, baseConfig)).toBe(false);
	});

	it("should return false for different domain when sameDomain is true", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://other.com/page", visited, baseConfig)).toBe(false);
	});

	it("should return true for different domain when sameDomain is false", () => {
		const visited = new Set<string>();
		const config = { ...baseConfig, sameDomain: false };
		expect(shouldCrawl("https://other.com/page", visited, config)).toBe(true);
	});

	it("should return true when URL matches includePattern", () => {
		const visited = new Set<string>();
		// includePattern needs to match the full URL
		const config = { ...baseConfig, includePattern: /\/docs/ };
		expect(shouldCrawl("https://example.com/docs/guide", visited, config)).toBe(true);
	});

	it("should return false when URL does not match includePattern", () => {
		const visited = new Set<string>();
		// includePattern needs to match the full URL
		const config = { ...baseConfig, includePattern: /\/docs/ };
		expect(shouldCrawl("https://example.com/about", visited, config)).toBe(false);
	});

	it("should return false when URL matches excludePattern", () => {
		const visited = new Set<string>();
		const config = { ...baseConfig, excludePattern: /\.pdf$/ };
		expect(shouldCrawl("https://example.com/file.pdf", visited, config)).toBe(false);
	});

	it("should return true when URL does not match excludePattern", () => {
		const visited = new Set<string>();
		const config = { ...baseConfig, excludePattern: /\.pdf$/ };
		expect(shouldCrawl("https://example.com/page.html", visited, config)).toBe(true);
	});

	it("should return false for PNG files", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/image.png", visited, baseConfig)).toBe(false);
	});

	it("should return false for JPG files", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/image.jpg", visited, baseConfig)).toBe(false);
	});

	it("should return false for PDF files", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/document.pdf", visited, baseConfig)).toBe(false);
	});

	it("should return false for ZIP files", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/archive.zip", visited, baseConfig)).toBe(false);
	});

	it("should return false for modern image formats (webp, avif, bmp, tiff)", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/image.webp", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/image.avif", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/image.bmp", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/image.tiff", visited, baseConfig)).toBe(false);
	});

	it("should return false for font files (otf)", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/font.otf", visited, baseConfig)).toBe(false);
	});

	it("should return false for archive formats (rar, 7z, bz2, xz)", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/archive.rar", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/archive.7z", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/archive.bz2", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/archive.xz", visited, baseConfig)).toBe(false);
	});

	it("should return false for video/audio formats (webm, ogg, avi, mov)", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/video.webm", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/audio.ogg", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/video.avi", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/video.mov", visited, baseConfig)).toBe(false);
	});

	it("should return false for dev-related non-HTML files (css, js, mjs, map, wasm)", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/style.css", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/app.js", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/module.mjs", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/app.js.map", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/module.wasm", visited, baseConfig)).toBe(false);
	});

	it("should return false for document formats (doc, docx, xls, xlsx, ppt, pptx)", () => {
		const visited = new Set<string>();
		expect(shouldCrawl("https://example.com/file.doc", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/file.docx", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/file.xls", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/file.xlsx", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/file.ppt", visited, baseConfig)).toBe(false);
		expect(shouldCrawl("https://example.com/file.pptx", visited, baseConfig)).toBe(false);
	});

	it("should handle include and exclude patterns together", () => {
		const visited = new Set<string>();
		const config = {
			...baseConfig,
			// includePattern needs to match full URL
			includePattern: /\/docs/,
			excludePattern: /draft/,
		};
		expect(shouldCrawl("https://example.com/docs/guide", visited, config)).toBe(true);
		expect(shouldCrawl("https://example.com/docs/draft", visited, config)).toBe(false);
		expect(shouldCrawl("https://example.com/blog/post", visited, config)).toBe(false);
	});
});

describe("extractLinks", () => {
	const baseConfig: CrawlConfig = {
		startUrl: "https://example.com",
		maxDepth: 2,
		maxPages: null,
		outputDir: "./output",
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
		version: "test-version",
	};

	it("should extract links from HTML", () => {
		const html = `
			<html>
				<body>
					<a href="/about">About</a>
					<a href="/contact">Contact</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toContain("https://example.com/about");
		expect(links).toContain("https://example.com/contact");
		expect(links).toHaveLength(2);
	});

	it("should normalize relative URLs", () => {
		const html = `
			<html>
				<body>
					<a href="about">About</a>
					<a href="/contact">Contact</a>
					<a href="https://other.com/page">External</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toContain("https://example.com/about");
		expect(links).toContain("https://example.com/contact");
		// External link should be excluded due to sameDomain=true
		expect(links).not.toContain("https://other.com/page");
	});

	it("should remove fragments from URLs", () => {
		const html = `
			<html>
				<body>
					<a href="/page#section1">Section 1</a>
					<a href="/page#section2">Section 2</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		// Both links should normalize to the same URL without fragment
		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude anchor-only links", () => {
		const html = `
			<html>
				<body>
					<a href="#top">Top</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude javascript: links", () => {
		const html = `
			<html>
				<body>
					<a href="javascript:void(0)">Click</a>
					<a href="javascript:alert('test')">Alert</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude mailto: links", () => {
		const html = `
			<html>
				<body>
					<a href="mailto:test@example.com">Email</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude tel: links", () => {
		const html = `
			<html>
				<body>
					<a href="tel:+1234567890">Call</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude data: URIs", () => {
		const html = `
			<html>
				<body>
					<a href="data:text/html,<h1>Test</h1>">Data URI</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude blob: URLs", () => {
		const html = `
			<html>
				<body>
					<a href="blob:https://example.com/some-guid">Blob</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude ftp: links", () => {
		const html = `
			<html>
				<body>
					<a href="ftp://ftp.example.com/file.txt">FTP</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude file: links", () => {
		const html = `
			<html>
				<body>
					<a href="file:///etc/hosts">File</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should exclude multiple non-http schemes", () => {
		const html = `
			<html>
				<body>
					<a href="tel:+1234567890">Call</a>
					<a href="mailto:test@example.com">Email</a>
					<a href="javascript:void(0)">JS</a>
					<a href="data:text/plain,test">Data</a>
					<a href="blob:abc-123">Blob</a>
					<a href="ftp://ftp.example.com/file">FTP</a>
					<a href="file:///path">File</a>
					<a href="/page1">Page 1</a>
					<a href="/page2">Page 2</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(2);
		expect(links).toContain("https://example.com/page1");
		expect(links).toContain("https://example.com/page2");
	});

	it("should exclude visited links", () => {
		const html = `
			<html>
				<body>
					<a href="/about">About</a>
					<a href="/contact">Contact</a>
				</body>
			</html>
		`;
		const visited = new Set<string>(["https://example.com/about"]);
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/contact");
	});

	it("should exclude binary file links", () => {
		const html = `
			<html>
				<body>
					<a href="/image.png">Image</a>
					<a href="/doc.pdf">PDF</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should handle empty href", () => {
		const html = `
			<html>
				<body>
					<a href="">Empty</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should handle links without href attribute", () => {
		const html = `
			<html>
				<body>
					<a>No href</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should deduplicate links", () => {
		const html = `
			<html>
				<body>
					<a href="/page">Page 1</a>
					<a href="/page">Page 2</a>
					<a href="/page">Page 3</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});

	it("should respect includePattern", () => {
		const html = `
			<html>
				<body>
					<a href="/docs/guide">Docs</a>
					<a href="/blog/post">Blog</a>
					<a href="/about">About</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		// includePattern needs to match full URL
		const config = { ...baseConfig, includePattern: /\/docs/ };
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, config);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/docs/guide");
	});

	it("should respect excludePattern", () => {
		const html = `
			<html>
				<body>
					<a href="/page/draft">Draft</a>
					<a href="/page/final">Final</a>
					<a href="/other">Other</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const config = { ...baseConfig, excludePattern: /draft/ };
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, config);

		expect(links).toContain("https://example.com/page/final");
		expect(links).toContain("https://example.com/other");
		expect(links).not.toContain("https://example.com/page/draft");
		expect(links).toHaveLength(2);
	});

	it("should handle external links when sameDomain is false", () => {
		const html = `
			<html>
				<body>
					<a href="https://other.com/page">External</a>
					<a href="/local">Local</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const config = { ...baseConfig, sameDomain: false };
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, config);

		expect(links).toContain("https://other.com/page");
		expect(links).toContain("https://example.com/local");
		expect(links).toHaveLength(2);
	});

	it("should handle case-insensitive file extensions", () => {
		const html = `
			<html>
				<body>
					<a href="/image.PNG">PNG Upper</a>
					<a href="/image.png">PNG Lower</a>
					<a href="/doc.PDF">PDF Upper</a>
					<a href="/page">Page</a>
				</body>
			</html>
		`;
		const visited = new Set<string>();
		const dom = new JSDOM(html, { url: "https://example.com" });
		const links = extractLinks(dom, visited, baseConfig);

		expect(links).toHaveLength(1);
		expect(links[0]).toBe("https://example.com/page");
	});
});
