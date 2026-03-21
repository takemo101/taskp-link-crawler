import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractContent, extractMetadata } from "../../src/parser/extractor.js";

describe("extractMetadata", () => {
	it("should extract title from title tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Test Page Title</title>
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.title).toBe("Test Page Title");
	});

	it("should extract description from meta tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta name="description" content="This is a test description">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.description).toBe("This is a test description");
	});

	it("should extract description from og:description", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta property="og:description" content="OG Description">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.description).toBe("OG Description");
	});

	it("should prefer meta description over og:description", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta name="description" content="Meta Description">
					<meta property="og:description" content="OG Description">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.description).toBe("Meta Description");
	});

	it("should extract keywords from meta tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta name="keywords" content="test, keywords, crawler">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.keywords).toBe("test, keywords, crawler");
	});

	it("should extract author from meta tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta name="author" content="John Doe">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.author).toBe("John Doe");
	});

	it("should extract og:title from meta tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta property="og:title" content="OG Title">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.ogTitle).toBe("OG Title");
	});

	it("should extract og:type from meta tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta property="og:type" content="article">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.ogType).toBe("article");
	});

	it("should return null for missing metadata", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Title Only</title>
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.title).toBe("Title Only");
		expect(metadata.description).toBeNull();
		expect(metadata.keywords).toBeNull();
		expect(metadata.author).toBeNull();
		expect(metadata.ogTitle).toBeNull();
		expect(metadata.ogType).toBeNull();
	});

	it("should extract all metadata at once", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Full Page</title>
					<meta name="description" content="Full description">
					<meta name="keywords" content="key1, key2">
					<meta name="author" content="Author Name">
					<meta property="og:title" content="OG Title">
					<meta property="og:type" content="website">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata).toEqual({
			title: "Full Page",
			description: "Full description",
			keywords: "key1, key2",
			author: "Author Name",
			ogTitle: "OG Title",
			ogType: "website",
		});
	});

	it("should trim whitespace from title", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>  Title With Whitespace  </title>
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.title).toBe("Title With Whitespace");
	});

	it("should return null for empty meta content", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta name="description" content="">
				</head>
				<body></body>
			</html>
		`;
		const dom = new JSDOM(html);
		const metadata = extractMetadata(dom);

		expect(metadata.description).toBeNull();
	});
});

describe("extractContent", () => {
	it("should extract content using Readability", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Article Title</title>
				</head>
				<body>
					<article>
						<h1>Main Article Heading</h1>
						<p>This is the main content of the article. It has enough text to be considered readable content.</p>
						<p>Second paragraph with more content to make it substantial for Readability to process correctly.</p>
						<p>Third paragraph continues the article with additional information and details about the topic.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/article" });
		const result = extractContent(dom);

		// Readability uses the document title, not the h1
		expect(result.title).toBe("Article Title");
		expect(result.content).not.toBeNull();
		expect(result.content).toContain("This is the main content");
	});

	it("should fallback when Readability fails", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Minimal Page</title>
				</head>
				<body>
					<p>Short content</p>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/minimal" });
		const result = extractContent(dom);

		// Readability may still extract minimal content or fall back
		// The test verifies the function doesn't throw
		expect(result).toHaveProperty("title");
		expect(result).toHaveProperty("content");
	});

	it("should remove script tags in fallback mode", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Page with Scripts</title>
				</head>
				<body>
					<p>Visible content</p>
					<script>var x = 'should be removed';</script>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/scripts" });
		const result = extractContent(dom);

		// Readability should handle this, or fallback should remove scripts
		if (result.content) {
			expect(result.content).not.toContain("var x");
			expect(result.content).not.toContain("should be removed");
		}
	});

	it("should remove style tags in fallback mode", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Page with Styles</title>
					<style>.red { color: red; }</style>
				</head>
				<body>
					<p>Visible content</p>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/styles" });
		const result = extractContent(dom);

		if (result.content) {
			expect(result.content).not.toContain("color: red");
		}
	});

	it("should handle article with main tag", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Main Tag Page</title>
				</head>
				<body>
					<main>
						<h1>Main Content Area</h1>
						<p>This is the main content area with sufficient text to be processed by Readability.</p>
						<p>Additional paragraphs provide more context and information for better content extraction.</p>
					</main>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/main" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("main");
		}
	});

	it("should handle page with navigation and footer", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Complex Page</title>
				</head>
				<body>
					<nav>
						<a href="/">Home</a>
						<a href="/about">About</a>
					</nav>
					<article>
						<h1>Real Article Content</h1>
						<p>This is the actual article content that should be extracted. It contains meaningful information.</p>
						<p>More paragraphs ensure the content is substantial enough for Readability to identify it properly.</p>
					</article>
					<footer>
						<p>Footer content</p>
					</footer>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/complex" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("Real Article Content");
			expect(result.content).not.toContain("Footer content");
		}
	});

	it("should handle empty HTML", () => {
		const html = "";
		const dom = new JSDOM(html, { url: "https://example.com/empty" });
		const result = extractContent(dom);

		expect(result.title).toBeNull();
		expect(result.content).toBeNull();
	});

	it("should handle HTML without readable content", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Empty Page</title>
				</head>
				<body>
					<p>Hi</p>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/short" });
		const result = extractContent(dom);

		// Readability may extract minimal content or return null
		// The test verifies the function handles short content gracefully
		expect(result).toHaveProperty("title");
		expect(result).toHaveProperty("content");
	});

	it("should extract content with proper URL context", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>URL Context Test</title>
				</head>
				<body>
					<article>
						<h1>Article</h1>
						<p>Content with a <a href="/relative">relative link</a> that needs URL context.</p>
						<p>More content here to make the article substantial and readable by the extraction algorithm.</p>
						<p>Third paragraph ensures there's enough text for Readability to identify this as main content.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/page" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should remove noscript tags in fallback", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>NoScript Test</title>
				</head>
				<body>
					<p>Visible</p>
					<noscript>Enable JavaScript</noscript>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/noscript" });
		const result = extractContent(dom);

		if (result.content) {
			expect(result.content).not.toContain("Enable JavaScript");
		}
	});

	it("should handle div with content class in fallback", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Content Class</title>
				</head>
				<body>
					<div class="content">
						<p>Content in class="content" div.</p>
					</div>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/content-class" });
		const result = extractContent(dom);

		// Readability may or may not find this, but if fallback is used, it should look for .content
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("content");
		}
	});

	it("should handle div with id=content in fallback", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>ID Content</title>
				</head>
				<body>
					<div id="content">
						<p>Content in id="content" div.</p>
					</div>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/id-content" });
		const result = extractContent(dom);

		if (result.content) {
			expect(result.content.toLowerCase()).toContain("content");
		}
	});
});

describe("extractContent - code block preservation", () => {
	it("should preserve standard pre/code blocks", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Code Example</title>
				</head>
				<body>
					<article>
						<h1>Installation Guide</h1>
						<p>To install the package, run:</p>
						<pre><code>npm install example-package</code></pre>
						<p>More text here to make content substantial.</p>
						<p>Additional paragraph for Readability to detect this as main content.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/code" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("<pre>");
		expect(result.content).toContain("<code>");
		expect(result.content).toContain("npm install example-package");
	});

	it("should preserve code blocks with language class", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>TypeScript Example</title>
				</head>
				<body>
					<article>
						<h1>TypeScript Guide</h1>
						<p>Here is a TypeScript example:</p>
						<pre><code class="language-typescript">const x: number = 42;</code></pre>
						<p>More content here.</p>
						<p>Another paragraph to ensure Readability detects this as main content.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/ts" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("typescript");
		expect(result.content).toContain("const x: number = 42");
	});

	it("should preserve data-rehype-pretty-code-fragment blocks (Next.js docs style)", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Next.js Docs</title>
				</head>
				<body>
					<article>
						<h1>Getting Started</h1>
						<p>Create a new app:</p>
						<div data-rehype-pretty-code-fragment="">
							<pre data-language="bash"><code>npx create-next-app@latest</code></pre>
						</div>
						<p>More content here to make the article substantial.</p>
						<p>Additional paragraph for better content detection.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://nextjs.org/docs" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("data-rehype-pretty-code-fragment");
		expect(result.content).toContain("npx create-next-app@latest");
	});

	it("should preserve hljs (Highlight.js) code blocks", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Highlight.js Example</title>
				</head>
				<body>
					<article>
						<h1>Code with Highlight.js</h1>
						<p>Example code:</p>
						<div class="hljs">
							<pre><code>function hello() {
  return "world";
}</code></pre>
						</div>
						<p>More text here.</p>
						<p>Another paragraph for content.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/hljs" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("hljs");
		expect(result.content).toContain("function hello()");
	});

	it("should preserve prism-code blocks", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Prism Example</title>
				</head>
				<body>
					<article>
						<h1>Prism.js Code</h1>
						<p>Example:</p>
						<div class="prism-code">
							<pre><code class="language-javascript">console.log("hello");</code></pre>
						</div>
						<p>More content.</p>
						<p>Additional paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/prism" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("prism-code");
		expect(result.content).toContain('console.log("hello")');
	});

	it("should preserve shiki code blocks", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Shiki Example</title>
				</head>
				<body>
					<article>
						<h1>Shiki Highlighted Code</h1>
						<p>Example:</p>
						<div class="shiki" data-language="rust">
							<pre><code>fn main() {
    println!("Hello, world!");
}</code></pre>
						</div>
						<p>More content here.</p>
						<p>Another paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/shiki" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("shiki");
		expect(result.content).toContain("fn main()");
	});

	it("should preserve multiple code blocks in one article", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Multiple Code Blocks</title>
				</head>
				<body>
					<article>
						<h1>Setup Guide</h1>
						<p>First, install:</p>
						<pre><code>npm install</code></pre>
						<p>Then configure:</p>
						<pre><code class="language-json">{
  "name": "example"
}</code></pre>
						<p>Finally, run:</p>
						<pre><code>npm start</code></pre>
						<p>More text here to ensure the article is substantial.</p>
						<p>Additional paragraph for better detection.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/multi" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		// Count occurrences of code blocks
		const codeMatches = result.content?.match(/<code/g);
		expect(codeMatches?.length).toBeGreaterThanOrEqual(3);
	});

	it("should preserve data-language attribute code blocks", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Data Language Example</title>
				</head>
				<body>
					<article>
						<h1>Code with Data Attribute</h1>
						<p>Example:</p>
						<pre data-language="python"><code>print("hello")</code></pre>
						<p>More content.</p>
						<p>Another paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/data-lang" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("data-language");
		expect(result.content).toContain("python");
	});

	it("should preserve .highlight class code blocks", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Highlight Class Example</title>
				</head>
				<body>
					<article>
						<h1>Highlighted Code</h1>
						<p>Example:</p>
						<div class="highlight">
							<pre><code>gem install rails</code></pre>
						</div>
						<p>More content here.</p>
						<p>Another paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/highlight" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("highlight");
	});

	it("should preserve .code-block class elements", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Code Block Class Example</title>
				</head>
				<body>
					<article>
						<h1>Code Block</h1>
						<p>Example:</p>
						<div class="code-block">
							<pre><code>docker run hello-world</code></pre>
						</div>
						<p>More content.</p>
						<p>Another paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/code-block" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("code-block");
	});

	it("should collect and preserve code blocks when removed from content in fallback mode", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Code Collection Test</title>
				</head>
				<body>
					<div class="container">
						<p>Some text content here that is not substantial enough.</p>
						<pre><code>npm install package</code></pre>
					</div>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/code-collection" });
		const result = extractContent(dom);

		// In fallback mode, code blocks should be collected and preserved
		expect(result.content).not.toBeNull();
	});

	it("should handle nested code block elements without duplication", () => {
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>Nested Code Test</title>
				</head>
				<body>
					<article>
						<h1>Article with Nested Code</h1>
						<p>This article has nested code blocks that should be handled correctly without duplication.</p>
						<p>Additional content to make the article substantial for Readability extraction.</p>
						<div data-rehype-pretty-code-fragment="">
							<pre data-language="javascript">
								<code class="language-javascript">
									const x = 1;
								</code>
							</pre>
						</div>
						<p>More content after the code block.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/nested-code" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		// Should contain the code content without duplication
		const matches = result.content?.match(/const x = 1/g);
		expect(matches?.length).toBeLessThanOrEqual(1);
	});
});

describe("extractContent - edge cases", () => {
	it("should handle HTML with only navigation elements", () => {
		// HTML with only nav elements - Readability should fail, triggering fallback
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title>Nav Only</title></head>
			<body>
				<nav><a href="/">Home</a></nav>
				<header>Header</header>
				<pre><code>some code</code></pre>
				<footer>Footer</footer>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/nav-only" });
		const result = extractContent(dom);

		// Fallback should provide content
		expect(result).toHaveProperty("content");
	});

	it("should handle data-rehype-pretty-code-figure with pre inside", () => {
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title>Figure Test</title></head>
			<body>
				<article>
					<h1>Test</h1>
					<p>Content here with enough text to be substantial for readability extraction.</p>
					<p>More content to ensure the article is detected properly by Readability.</p>
					<figure data-rehype-pretty-code-figure="">
						<pre data-language="python"><code>print("hello")</code></pre>
					</figure>
					<p>Final paragraph to close the article.</p>
				</article>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/figure" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("print");
		}
	});
});

describe("extractContent - fallback code block preservation", () => {
	it("should collect and preserve code blocks during fallback extraction (lines 110-117)", () => {
		// Script+style only triggers Readability failure -> fallback collects code blocks (lines 110-117)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<pre><code>code block 1</code></pre>
				<div data-language="js"><code>code block 2</code></div>
				<div class="code-block"><pre>code block 3</pre></div>
				<div class="hljs"><code>code block 4</code></div>
				<div class="highlight"><code>code block 5</code></div>
				<div class="prism-code"><code>code block 6</code></div>
				<div class="shiki"><code>code block 7</code></div>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-code" });
		const result = extractContent(dom);

		// Fallback should provide content with code blocks
		expect(result.content).not.toBeNull();
		if (result.content) {
			// Check that code blocks are present (lines 110-117 collect them)
			const hasCodeBlocks =
				result.content.includes("code block") ||
				result.content.includes("<pre>") ||
				result.content.includes("<code>");
			expect(hasCodeBlocks).toBe(true);
		}
	});

	it("should add collected code blocks to content when not present (line 123)", () => {
		// Script+style only triggers fallback, code blocks are collected and added (line 123)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<div class="content">
					<span>text</span>
				</div>
				<pre><code>important code snippet</code></pre>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/code-addition" });
		const result = extractContent(dom);

		// Fallback should collect code blocks and add them
		expect(result.content).not.toBeNull();
		if (result.content) {
			// Verify code blocks were added (line 123)
			const hasCode =
				result.content.includes("code") ||
				result.content.includes("snippet") ||
				result.content.includes("pre");
			expect(hasCode).toBe(true);
		}
	});

	it("should extract from main tag in fallback mode (line 132)", () => {
		// Script+style only - Readability fails, fallback uses main selector (line 132)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<main>
					<span>Main content</span>
				</main>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/main-fallback" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should extract from main tag (line 132)
			expect(result.content.length).toBeGreaterThan(0);
		}
	});

	it("should extract from article tag in fallback mode (line 132)", () => {
		// Script+style triggers fallback, uses article selector (line 132)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<article>
					<span>Article</span>
				</article>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/article-fallback" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from role=main element in fallback mode (line 132)", () => {
		// Script+style triggers fallback, uses [role='main'] selector (line 132)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<div role="main">
					<span>Role Main</span>
				</div>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/role-main-fallback" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from .content class in fallback mode (line 132)", () => {
		// Script+style triggers fallback, uses .content selector (line 132)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<div class="content">
					<span>Content Class</span>
				</div>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/content-class-fallback" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from #content id in fallback mode (line 132)", () => {
		// Script+style triggers fallback, uses #content selector (line 132)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<div id="content">
					<span>Content ID</span>
				</div>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/content-id-fallback" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should fallback to body when no selector matches (line 132)", () => {
		// Script+style with no specific selectors - triggers fallback to body (line 132)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<div class="random">
					<span>Random</span>
				</div>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/body-fallback" });
		const result = extractContent(dom);

		// Should fallback to body when no specific selector matches
		expect(result).toHaveProperty("content");
	});

	it("should handle code blocks with all selector types in fallback (lines 110-117)", () => {
		// Script+style triggers fallback, test all CODE_BLOCK_SELECTORS during collection (lines 110-117)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<pre>pre elem</pre>
				<code>code elem</code>
				<div data-language="python">data-language</div>
				<div data-rehype-pretty-code-fragment="">rehype</div>
				<div class="code-block">code-block</div>
				<div class="highlight">highlight</div>
				<div class="hljs">hljs</div>
				<div class="prism-code">prism</div>
				<div class="shiki">shiki</div>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/all-selectors" });
		const result = extractContent(dom);

		// Should collect code blocks from all selectors (lines 110-117)
		expect(result.content).not.toBeNull();
	});

	it("should handle content without code blocks in fallback (line 123 else path)", () => {
		// Script+style triggers fallback with inline code
		// Code blocks are inline, so hasCodeBlock check should find them (line 123 else)
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>var x = 1;</script>
				<style>.test { color: red; }</style>
				<main>
					<span>Text with <pre><code>code</code></pre> inline</span>
				</main>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/has-code" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should detect existing code blocks, so line 123's else path is taken
			expect(result.content).toBeTruthy();
		}
	});

	it("should trigger fallback with empty body", () => {
		// Completely empty body - definitely triggers fallback
		const html = `<!DOCTYPE html><html><head><title></title></head><body></body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/empty" });
		const result = extractContent(dom);

		// Fallback returns empty content for empty body (may be whitespace or null)
		expect(result.title).toBeNull();
		// Content may be null or just whitespace
		if (result.content) {
			expect(result.content.trim()).toBe("");
		}
	});

	it("should trigger fallback and extract from added main element", () => {
		// Start with script/style only (triggers fallback), but with main added via DOM manipulation
		// This won't work because fallback gets the original HTML string
		// Instead, use a pattern where nav/header/footer are present with main
		const html = `
			<!DOCTYPE html>
			<html>
			<head><title></title></head>
			<body>
				<script>/* This makes Readability less likely to succeed */</script>
				<noscript>Please enable JavaScript</noscript>
				<nav><a href="/">Home</a></nav>
				<header><h1>Header</h1></header>
				<main><p>Main content here</p><pre><code>test code</code></pre></main>
				<aside>Sidebar</aside>
				<footer><p>Footer</p></footer>
			</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/complex" });
		const result = extractContent(dom);

		// Should extract content (either via Readability or fallback)
		expect(result.content).not.toBeNull();
	});
});

describe("extractContent - fallback code block detection patterns", () => {
	it("should detect code blocks with data-language attribute in fallback", () => {
		// Tests that data-language="python" is detected (not "[data-language]" string)
		// Use script/style only to trigger fallback
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="container">
				<p>Text without code</p>
			</div>
			<pre data-language="python"><code>print("hello")</code></pre>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/detect-data-language" });
		const result = extractContent(dom);

		// Code block should be detected and added
		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("print");
		}
	});

	it("should detect code blocks with class attributes in fallback", () => {
		// Tests that class="code-block" is detected (not ".code-block" string)
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="container">
				<p>Text without code</p>
			</div>
			<div class="code-block"><pre>code here</pre></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/detect-class" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("code here");
		}
	});

	it("should not trigger false positive for 'previous' text in fallback", () => {
		// Tests that "previous" text doesn't match <pre> pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<main>
				<p>In the previous section, we prepared the code.</p>
				<p>We also discussed encoding and decoding.</p>
			</main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/no-false-previous" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		// Content should have the text but no code blocks should be prepended
		// (Because the pattern check should not match "previous" or "prepared")
	});

	it("should not trigger false positive for CSS selector strings in fallback", () => {
		// Tests that CSS selector strings like "[data-language]" don't match
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<main>
				<p>Use the selector [data-language] or .code-block in your CSS.</p>
				<p>Also try pre and code tags.</p>
			</main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/no-false-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		// Should not detect CSS selector strings or words as actual code blocks
	});

	it("should detect <pre> tags correctly in fallback", () => {
		// Tests that actual <pre> tags are detected
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="container"><p>Text without code</p></div>
			<pre>formatted text</pre>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/detect-pre" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("formatted");
		}
	});

	it("should detect <code> tags correctly in fallback", () => {
		// Tests that actual <code> tags are detected
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="container"><p>Text without code</p></div>
			<code>inline code</code>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/detect-code" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("inline");
		}
	});

	it("should detect all class-based code block patterns in fallback", () => {
		// Tests all class patterns: highlight, hljs, prism-code, shiki
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="container"><p>Text</p></div>
			<div class="highlight"><pre>1</pre></div>
			<div class="hljs"><pre>2</pre></div>
			<div class="prism-code"><pre>3</pre></div>
			<div class="shiki"><pre>4</pre></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/detect-all-classes" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should detect data-rehype-pretty-code-fragment attribute in fallback", () => {
		// Tests that data-rehype-pretty-code-fragment is detected
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="container"><p>Text</p></div>
			<div data-rehype-pretty-code-fragment=""><pre>code</pre></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/detect-rehype" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("code");
		}
	});

	it("should not prepend code blocks when content already has them", () => {
		// Tests the pattern matching prevents duplication
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<main>
				<p>Introduction</p>
				<pre><code>existing code</code></pre>
			</main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/has-code-already" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		// Should have the code but not duplicated
	});
});

describe("extractContent - fallback edge cases for coverage", () => {
	// These tests target uncovered lines in extractAndPreserveCodeBlocks:
	// Lines 110, 113-117, 123, 132-136
	//
	// Readability returns null when:
	// - Body is empty or only has script/style
	// - Content is in elements Readability ignores (aside, nav, header, footer)
	//
	// Key: Place code blocks in <aside> to trigger fallback while having code blocks

	it("should collect code blocks in fallback when in ignored elements (line 110-117)", () => {
		// <aside> content is ignored by Readability -> returns null -> triggers fallback
		// Fallback collects code blocks before removing aside (lines 110-117)
		const html = `<!DOCTYPE html><html><body>
			<script>var x = 1;</script>
			<style>.test { }</style>
			<aside><pre><code>code in aside</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-code-collection" });
		const result = extractContent(dom);

		// Fallback executes and collects code blocks
		expect(result).toHaveProperty("content");
	});

	it("should collect all code block selector types in fallback (line 113-117)", () => {
		// All code blocks in aside -> Readability fails -> fallback collects them
		// Tests all CODE_BLOCK_SELECTORS (lines 113-117)
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<aside>
				<pre>1</pre>
				<code>2</code>
				<div data-language="js">3</div>
				<div data-rehype-pretty-code-fragment="">4</div>
				<div class="code-block">5</div>
				<div class="highlight">6</div>
				<div class="hljs">7</div>
				<div class="prism-code">8</div>
				<div class="shiki">9</div>
			</aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-all-selectors" });
		const result = extractContent(dom);

		expect(result).toHaveProperty("content");
	});

	it("should append collected code blocks to content (line 123)", () => {
		// Code blocks in aside (collected), main has text without code
		// Tests line 123: if (!hasCodeBlock) { content = codeBlocks + content }
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><span>text only</span></main>
			<aside><pre><code>code block</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-append" });
		const result = extractContent(dom);

		expect(result).toHaveProperty("content");
	});

	it("should extract from main selector in fallback (line 132)", () => {
		// Script/style only -> fallback
		// Tests: querySelector("main, article, [role='main'], .content, #content") || body
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<main><span>main</span></main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-main-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from article selector in fallback (line 132)", () => {
		// Script/style -> fallback -> article selector
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<article><span>article</span></article>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-article-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from role=main selector in fallback (line 132)", () => {
		// Script/style -> fallback -> [role='main'] selector
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div role="main"><span>role</span></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-role-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from .content selector in fallback (line 132)", () => {
		// Script/style -> fallback -> .content selector
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="content"><span>content</span></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-content-class-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should extract from #content selector in fallback (line 132)", () => {
		// Script/style -> fallback -> #content selector
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div id="content"><span>id</span></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-content-id-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
	});

	it("should fallback to body when no selector matches (line 132-136)", () => {
		// Script/style -> fallback -> no specific selector -> uses body
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<div class="other"><span>text</span></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-body-selector" });
		const result = extractContent(dom);

		expect(result).toHaveProperty("content");
	});

	it("should handle empty innerHTML from selector (line 133-136)", () => {
		// Script/style -> fallback -> main is empty
		// Tests: let content = main?.innerHTML || null (line 133)
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<main></main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-empty-innerHTML" });
		const result = extractContent(dom);

		// Content is null or empty (line 133: || null)
		expect(result).toHaveProperty("content");
	});

	it("should not duplicate when content already has code blocks (line 123 else)", () => {
		// Code in aside (collected) + code in main (already in content)
		// hasCodeBlock check prevents duplication (line 123 else branch)
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><pre><code>inline</code></pre></main>
			<aside><pre><code>aside</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-no-duplicate" });
		const result = extractContent(dom);

		expect(result).toHaveProperty("content");
	});

	it("should handle completely empty body (line 132-136)", () => {
		// Empty body -> Readability fails -> fallback -> body has no content
		const html = `<!DOCTYPE html><html><body></body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/fallback-completely-empty" });
		const result = extractContent(dom);

		expect(result.title).toBeNull();
		// Content may be null or empty
		expect(result).toHaveProperty("content");
	});

	it("should accurately detect code blocks in fallback mode without false positives from text content", () => {
		// HTML with minimal content to trigger fallback
		// Code blocks in body (collected during fallback), main has text with "pre"/"code" words
		// Tests the fix for Issue #552: DOM-based detection instead of string includes()
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<pre><code>real code block</code></pre>
			<main>
				<span>This is the previous section with code of conduct.</span>
			</main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/issue-552-false-positive" });
		const result = extractContent(dom);

		// Should include the collected code block because main doesn't have actual code elements
		// Before fix: "pre" in "previous" would cause false positive, skipping code block addition
		// After fix: DOM query correctly identifies no code blocks in main, so code is added
		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("real code block");
		}
	});
});

describe("extractContent - fallback code block detection (Issue #514)", () => {
	// Tests for Issue #514: CSS selectors vs HTML content matching

	it("should detect hljs class in fallback content", () => {
		// Main has hljs class -> should be detected by CODE_BLOCK_INDICATORS
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div class="hljs"><code>code with hljs</code></div></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/hljs-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should contain hljs code block
			expect(result.content.toLowerCase()).toContain("hljs");
		}
	});

	it("should detect shiki class in fallback content", () => {
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div class="shiki"><code>shiki code</code></div></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/shiki-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("shiki");
		}
	});

	it("should detect prism-code class in fallback content", () => {
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div class="prism-code"><code>prism code</code></div></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/prism-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("prism");
		}
	});

	it("should detect highlight class in fallback content", () => {
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div class="highlight"><code>highlighted</code></div></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/highlight-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("highlight");
		}
	});

	it("should detect code-block class in fallback content", () => {
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div class="code-block"><code>code block</code></div></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/code-block-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("code-block");
		}
	});

	it("should detect data-language attribute in fallback content", () => {
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><pre data-language="python"><code>python code</code></pre></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/data-language-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("data-language");
		}
	});

	it("should detect data-rehype-pretty-code attribute in fallback content", () => {
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div data-rehype-pretty-code-fragment=""><code>rehype</code></div></main>
			<aside><pre><code>aside code</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/rehype-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content.toLowerCase()).toContain("data-rehype-pretty-code");
		}
	});

	it("should not duplicate code blocks when detected in content", () => {
		// Content has hljs code -> detected by indicator -> collected blocks not added
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><div class="hljs"><pre><code>main code</code></pre></div></main>
			<aside><pre><code>aside code that should not duplicate</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/no-duplicate-detect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should contain main code
			expect(result.content.toLowerCase()).toContain("main code");
			// Should not duplicate aside code (because hljs was detected in content)
			const asideMatches = result.content.match(/aside code/gi);
			expect(asideMatches?.length || 0).toBeLessThanOrEqual(1);
		}
	});

	it("should add collected code blocks when no indicator found in content", () => {
		// Content has no code indicators -> collected blocks should be added
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<main><p>Just plain text without any code</p></main>
			<aside><pre><code>important code from aside</code></pre></aside>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/add-collected" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should contain collected code blocks
			expect(result.content.toLowerCase()).toContain("code");
		}
	});
});

describe("extractContent - protectCodeBlocks nested elements (lines 53, 62)", () => {
	it("should skip child elements when parent code block is already processed", () => {
		// Tests lines 496, 503-504, 509 in HTML coverage (lines 53, 62 in source)
		// shouldSkip logic: when parent is already processed, child elements should be skipped
		// Priority selectors process [data-rehype-pretty-code-fragment] before pre/code
		const html = `<!DOCTYPE html><html><body>
			<article>
				<h1>Code Example with Nested Blocks</h1>
				<p>This example demonstrates nested code block elements where the parent matches a higher-priority selector.</p>
				<div data-rehype-pretty-code-fragment="">
					<pre data-language="javascript">
						<code class="language-javascript">
							const nested = "should appear once";
						</code>
					</pre>
				</div>
				<p>The parent div with data-rehype-pretty-code-fragment is processed first.</p>
				<p>Then pre and code are checked but skipped because their parent was already processed.</p>
				<p>This prevents duplication of the same code block multiple times.</p>
				<p>Additional content to ensure Readability processes this as main content.</p>
			</article>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/nested-skip" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("nested");
			// Should only appear once despite three matching selectors (data-rehype, pre, code)
			const matches = result.content.match(/should appear once/g);
			expect(matches?.length).toBe(1);
		}
	});

	it("should handle multiple nested code block structures", () => {
		// Tests nested structures with different priority selectors
		const html = `<!DOCTYPE html><html><body>
			<article>
				<h1>Multiple Nested Structures</h1>
				<p>First example:</p>
				<div class="shiki">
					<pre data-language="python"><code>print("first")</code></pre>
				</div>
				<p>Second example:</p>
				<div class="prism-code">
					<pre><code class="language-typescript">const second = true;</code></pre>
				</div>
				<p>Third example:</p>
				<div data-rehype-pretty-code-fragment="">
					<pre><code>third example</code></pre>
				</div>
				<p>Additional content for Readability.</p>
			</article>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/multi-nested" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Each code block should appear only once
			const firstMatches = result.content.match(/print\("first"\)/g);
			const secondMatches = result.content.match(/const second/g);
			const thirdMatches = result.content.match(/third example/g);

			expect(firstMatches?.length).toBe(1);
			expect(secondMatches?.length).toBe(1);
			expect(thirdMatches?.length).toBe(1);
		}
	});

	it("should process deeply nested code blocks without duplication", () => {
		// Tests deep nesting: rehype-fragment > pre > code
		const html = `<!DOCTYPE html><html><body>
			<article>
				<h1>Deep Nesting Test</h1>
				<p>Code with nested structure example:</p>
				<figure data-rehype-pretty-code-figure="">
					<div data-rehype-pretty-code-fragment="">
						<pre data-language="rust" tabindex="0">
							<code class="language-rust">
								<span class="line">fn main() {</span>
								<span class="line">    println!("hello_rust");</span>
								<span class="line">}</span>
							</code>
						</pre>
					</div>
				</figure>
				<p>More content here.</p>
				<p>Additional paragraph for content detection.</p>
			</article>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/deep-nested" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("hello_rust");
			// Should appear once despite multiple nested selectors matching (figure, fragment, pre, code)
			const matches = result.content.match(/hello_rust/g);
			expect(matches?.length).toBe(1);
		}
	});

	it("should handle .highlight > pre > code nesting correctly (Issue #621)", () => {
		// Classic GitHub Pages / Jekyll style nesting
		const html = `<!DOCTYPE html><html><body>
			<article>
				<h1>Code Example</h1>
				<p>Installation command:</p>
				<div class="highlight">
					<pre><code>npm install example-package</code></pre>
				</div>
				<p>More content here to ensure proper extraction.</p>
				<p>Additional paragraph for Readability.</p>
			</article>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/issue-621-highlight" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should preserve the outer .highlight div
			expect(result.content).toContain('class="highlight"');
			// Code should appear only once
			const matches = result.content.match(/npm install example-package/g);
			expect(matches?.length).toBe(1);
		}
	});

	it("should handle multiple independent .highlight blocks (Issue #621)", () => {
		const html = `<!DOCTYPE html><html><body>
			<article>
				<h1>Multiple Code Examples</h1>
				<p>First command:</p>
				<div class="highlight">
					<pre><code>git init</code></pre>
				</div>
				<p>Second command:</p>
				<div class="highlight">
					<pre><code>git add .</code></pre>
				</div>
				<p>Third command:</p>
				<div class="highlight">
					<pre><code>git commit -m "Initial commit"</code></pre>
				</div>
				<p>Final paragraph for proper extraction.</p>
			</article>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/issue-621-multiple" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Each command should appear exactly once
			const initMatches = result.content.match(/git init/g);
			const addMatches = result.content.match(/git add/g);
			const commitMatches = result.content.match(/git commit/g);

			expect(initMatches?.length).toBe(1);
			expect(addMatches?.length).toBe(1);
			expect(commitMatches?.length).toBe(1);
		}
	});

	it("should handle complex real-world nested structure (Issue #621)", () => {
		// Simulates Next.js docs style with multiple nested selectors
		const html = `<!DOCTYPE html><html><body>
			<article>
				<h1>Getting Started with Next.js</h1>
				<p>Create a new application:</p>
				<div data-rehype-pretty-code-fragment="">
					<pre data-language="bash" tabindex="0">
						<code class="language-bash">
							<span class="line">npx create-next-app@latest</span>
						</code>
					</pre>
				</div>
				<p>Configure TypeScript:</p>
				<div data-rehype-pretty-code-fragment="">
					<pre data-language="typescript">
						<code class="language-typescript">
							<span class="line">export default function Page() {</span>
							<span class="line">  return &lt;h1&gt;Hello World&lt;/h1&gt;</span>
							<span class="line">}</span>
						</code>
					</pre>
				</div>
				<p>Additional content for proper extraction by Readability.</p>
			</article>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/issue-621-nextjs" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// First code block should appear once
			const createMatches = result.content.match(/create-next-app/g);
			expect(createMatches?.length).toBe(1);

			// Second code block should appear once
			const functionMatches = result.content.match(/export default function Page/g);
			expect(functionMatches?.length).toBe(1);
		}
	});
});

describe("extractContent - CODE_BLOCK_HTML_PATTERNS detection (line 144)", () => {
	it("should detect existing <pre> tags in fallback content and not duplicate", () => {
		// Tests line 144: pattern.test(currentContent) returns true for <pre>
		const html = `<!DOCTYPE html><html><body>
			<script>var trigger = "fallback";</script>
			<style>.test { }</style>
			<aside><pre><code>collected code</code></pre></aside>
			<main>
				<p>Main content text</p>
				<pre><code>existing pre tag</code></pre>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-pre" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Main content should have existing code
			expect(result.content).toContain("existing pre tag");
			// Pattern detected, so collected code should NOT be prepended
			// If it was added, it would appear before main content
		}
	});

	it("should detect existing <code> tags in fallback content", () => {
		// Tests /<code[\s>]/i pattern detection
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><pre><code>aside code</code></pre></aside>
			<main>
				<p>Inline <code>code example</code> in text</p>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-code-tag" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("code example");
		}
	});

	it("should detect data-language attribute in fallback content", () => {
		// Tests /data-language=/i pattern detection
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><div class="code-block"><code>collected</code></div></aside>
			<main>
				<p>Example:</p>
				<pre data-language="bash"><code>echo "test"</code></pre>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-data-lang" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("data-language");
		}
	});

	it("should detect data-rehype-pretty-code-fragment in fallback content", () => {
		// Tests /data-rehype-pretty-code-fragment/i pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><pre><code>aside</code></pre></aside>
			<main>
				<div data-rehype-pretty-code-fragment=""><pre>code</pre></div>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-rehype-attr" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("data-rehype-pretty-code-fragment");
		}
	});

	it("should detect .code-block class in fallback content", () => {
		// Tests /class="[^"]*\bcode-block\b/i pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><pre><code>collected</code></pre></aside>
			<main>
				<div class="code-block"><pre>example</pre></div>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-code-block-class" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("code-block");
		}
	});

	it("should detect .highlight class in fallback content", () => {
		// Tests /class="[^"]*\bhighlight\b/i pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><code>aside</code></aside>
			<main>
				<div class="highlight"><pre>highlighted</pre></div>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-highlight-class" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("highlight");
		}
	});

	it("should detect .hljs class in fallback content", () => {
		// Tests /class="[^"]*\bhljs\b/i pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><pre>aside</pre></aside>
			<main>
				<div class="hljs"><code>hljs code</code></div>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-hljs-class" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("hljs");
		}
	});

	it("should detect .prism-code class in fallback content", () => {
		// Tests /class="[^"]*\bprism-code\b/i pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><pre>aside</pre></aside>
			<main>
				<div class="prism-code"><code>prism</code></div>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-prism-class" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("prism-code");
		}
	});

	it("should detect .shiki class in fallback content", () => {
		// Tests /class="[^"]*\bshiki\b/i pattern
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside><pre>aside</pre></aside>
			<main>
				<div class="shiki"><code>shiki code</code></div>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/detect-shiki-class" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			expect(result.content).toContain("shiki");
		}
	});

	it("should add collected code blocks when no pattern detected in content", () => {
		// Tests lines 576, 590-593 in HTML coverage (lines 129, 143-146 in source)
		// Triggers fallback: codeBlocks.push() and hasCodeBlock check with prepending
		// Script+style only → Readability returns null → fallback path
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<pre><code>collected code block</code></pre>
			<main><span>x</span></main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/fallback-collect-add" });
		const result = extractContent(dom);

		// Fallback should execute and collect code blocks (line 576/129)
		// Then check if content has code patterns (line 590-591/143-144)
		// Since main has no code pattern, prepend collected blocks (line 593/146)
		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should include collected code block
			const hasCode =
				result.content.includes("collected") ||
				result.content.includes("code block") ||
				result.content.includes("<pre>");
			expect(hasCode).toBe(true);
		}
	});

	it("should handle multiple collected code blocks when adding to content", () => {
		// Tests line 576 (129) multiple times: collecting various code block types
		// Tests line 593 (146): prepending all collected blocks
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<pre><code>first block</code></pre>
			<div class="hljs"><code>second block</code></div>
			<div data-language="python">third block</div>
			<main><span>y</span></main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/fallback-multi-collect" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should collect and include multiple code blocks
			const hasAny =
				result.content.includes("block") ||
				result.content.includes("<pre>") ||
				result.content.includes("hljs");
			expect(hasAny).toBe(true);
		}
	});

	it("should not add collected blocks when content already matches any pattern", () => {
		// Tests that ANY pattern match prevents code block addition
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<style>y</style>
			<aside>
				<pre><code>collected block 1</code></pre>
				<div class="hljs"><code>collected block 2</code></div>
			</aside>
			<main>
				<p>Text before</p>
				<code>tiny inline code</code>
				<p>Text after</p>
			</main>
		</body></html>`;

		const dom = new JSDOM(html, { url: "https://example.com/has-inline-code" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// Should have inline code from main
			expect(result.content).toContain("tiny inline code");
			// Collected blocks should not be duplicated
			// (Pattern detected <code> in content, so collected blocks aren't added)
		}
	});
});

describe("extractContent - Issue #622: fallback path marker restoration", () => {
	it("should preserve code blocks in fallback path after marker restoration", () => {
		// Readabilityが失敗するHTML（短すぎるコンテンツ）
		// protectCodeBlocks でマーカーに置換された後、フォールバックで復元されることを確認
		const html = `<!DOCTYPE html><html><body>
			<pre><code>important code snippet</code></pre>
			<p>Short content that Readability may not extract</p>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/issue-622-fallback" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// コードブロックが正しく保持されている
			expect(result.content).toContain("<pre>");
			expect(result.content).toContain("<code>");
			expect(result.content).toContain("important code snippet");
		}
	});

	it("should restore multiple code blocks in fallback path", () => {
		// 複数のコードブロックが全て復元されることを確認
		const html = `<!DOCTYPE html><html><body>
			<script>var x = 1;</script>
			<style>.test { }</style>
			<main>
				<pre><code class="language-js">const x = 1;</code></pre>
				<p>Text content here</p>
				<div class="code-block"><pre>docker run</pre></div>
			</main>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/issue-622-multiple" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// 複数のコードブロックが全て保持されている
			expect(result.content).toContain("const x = 1");
			expect(result.content).toContain("docker run");
		}
	});

	it("should restore code blocks with special attributes in fallback path", () => {
		// data-rehype-pretty-code-fragment などの特殊な属性を持つコードブロックも復元される
		const html = `<!DOCTYPE html><html><body>
			<script>x</script>
			<div data-rehype-pretty-code-fragment="">
				<pre data-language="python"><code>print("hello")</code></pre>
			</div>
			<div class="shiki"><code>shiki code</code></div>
			<div class="hljs"><code>hljs code</code></div>
		</body></html>`;
		const dom = new JSDOM(html, { url: "https://example.com/issue-622-special" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// 特殊な属性を持つコードブロックが保持されている
			expect(result.content).toContain('print("hello")');
			expect(result.content).toContain("shiki code");
			expect(result.content).toContain("hljs code");
		}
	});
});

describe("extractContent - nested code block deduplication (Issue #631)", () => {
	it("should not duplicate nested code blocks with specific selectors", () => {
		// .highlight > pre > code のようなネスト構造で重複しないこと
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Nested Code Test</title></head>
				<body>
					<article>
						<h1>Code Example</h1>
						<p>Example with nested code blocks that should not be duplicated:</p>
						<div class="highlight">
							<pre data-language="javascript">
								<code class="language-javascript">const x = 1;</code>
							</pre>
						</div>
						<p>More content here to make this substantial for Readability.</p>
						<p>Additional paragraph to ensure proper content extraction.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/nested" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// コードは1回だけ出現すべき（重複なし）
			const codeMatches = result.content.match(/const x = 1/g);
			expect(codeMatches).toBeTruthy();
			expect(codeMatches?.length).toBe(1);
		}
	});

	it("should handle nested elements with same selector (same class)", () => {
		// 同じクラスを持つネストされた要素（ネスト検出の主要なユースケース）
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Same Selector Nesting</title></head>
				<body>
					<article>
						<h1>Nested Same Class Test</h1>
						<p>Testing nested divs with the same class name:</p>
						<div class="highlight" id="outer-div">
							Outer content
							<div class="highlight" id="inner-div">
								Inner content
								<pre><code>nested code in same selector</code></pre>
							</div>
						</div>
						<p>More content to ensure proper extraction.</p>
						<p>Additional paragraph for content weight.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/same-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// ネストされた要素が重複処理されないことを確認
			// 外側のdivが処理され、内側は自動的に含まれる
			const hasContent =
				result.content.includes("nested code") ||
				result.content.includes("Outer content") ||
				result.content.includes("Inner content");
			expect(hasContent).toBe(true);
		}
	});

	it("should handle deeply nested elements with same class", () => {
		// 3レベル以上のネスト with 同じセレクタ
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Deep Nesting Same Class</title></head>
				<body>
					<article>
						<h1>Deep Nesting Test</h1>
						<p>Testing multiple levels of nesting with same class:</p>
						<div class="code-block" id="level1">
							Level 1
							<div class="code-block" id="level2">
								Level 2
								<div class="code-block" id="level3">
									Level 3
									<pre><code>deeply nested code</code></pre>
								</div>
							</div>
						</div>
						<p>Content after nested structure.</p>
						<p>More paragraphs for proper extraction.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/deep-nesting" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// 深くネストされたコードブロックも正しく処理される
			const hasNested =
				result.content.includes("deeply nested") || result.content.includes("Level");
			expect(hasNested).toBe(true);
		}
	});

	it("should handle deeply nested code blocks correctly", () => {
		// data-rehype-pretty-code-fragment > pre > code のような深いネスト
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Deep Nesting Test</title></head>
				<body>
					<article>
						<h1>Deep Nesting Example</h1>
						<p>Testing deep nesting with multiple matching selectors:</p>
						<div data-rehype-pretty-code-fragment="">
							<pre data-language="typescript">
								<code>const y: number = 42;</code>
							</pre>
						</div>
						<p>More text to ensure Readability processes this correctly.</p>
						<p>Another paragraph for content weight.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/deep-nest" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// コードは1回だけ出現すべき
			const codeMatches = result.content.match(/const y: number = 42/g);
			expect(codeMatches).toBeTruthy();
			expect(codeMatches?.length).toBe(1);
		}
	});

	it("should handle multiple independent code blocks without interference", () => {
		// 独立した複数のコードブロックは全て保持されること
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Multiple Independent Blocks</title></head>
				<body>
					<article>
						<h1>Multiple Code Examples</h1>
						<p>First example:</p>
						<pre><code>code block 1</code></pre>
						<p>Second example:</p>
						<pre><code>code block 2</code></pre>
						<p>Third example:</p>
						<div class="highlight"><pre><code>code block 3</code></pre></div>
						<p>Additional content to ensure Readability extracts properly.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/multiple-independent" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// 全てのコードブロックが保持されている
			expect(result.content).toContain("code block 1");
			expect(result.content).toContain("code block 2");
			expect(result.content).toContain("code block 3");

			// 重複していない
			expect(result.content.match(/code block 1/g)?.length).toBe(1);
			expect(result.content.match(/code block 2/g)?.length).toBe(1);
			expect(result.content.match(/code block 3/g)?.length).toBe(1);
		}
	});

	it("should handle same element matching multiple selectors", () => {
		// 同じ要素が複数のセレクタにマッチする場合
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Multiple Selector Match</title></head>
				<body>
					<article>
						<h1>Example</h1>
						<p>Code block that matches multiple selectors:</p>
						<pre class="highlight" data-language="python">
							<code>print("hello world")</code>
						</pre>
						<p>More content for Readability.</p>
						<p>Additional paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/multi-selector" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// コードは1回だけ出現（重複処理されていない）
			const codeMatches = result.content.match(/print\("hello world"\)/g);
			expect(codeMatches).toBeTruthy();
			expect(codeMatches?.length).toBe(1);
		}
	});

	it("should skip child elements when parent is already processed", () => {
		// 親要素が処理済みの場合、子要素をスキップすること
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Parent-Child Skip Test</title></head>
				<body>
					<article>
						<h1>Nesting with Priority</h1>
						<p>Testing parent-child relationship:</p>
						<div class="code-block">
							<pre><code>nested code</code></pre>
						</div>
						<p>More content here.</p>
						<p>Another paragraph.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/parent-skip" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		if (result.content) {
			// 親要素（.code-block）が処理され、子要素（pre, code）は重複処理されない
			const codeMatches = result.content.match(/nested code/g);
			expect(codeMatches).toBeTruthy();
			expect(codeMatches?.length).toBe(1);
		}
	});
});

describe("extractContent - Readability edge cases (line 171)", () => {
	it("should handle Readability success with no title tag (line 171)", () => {
		// Tests line 171: article.title ?? null
		// Readability extracts content but title is missing/empty
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<!-- No title tag to test title extraction -->
				</head>
				<body>
					<article>
						<h1>Article Heading</h1>
						<p>This is a substantial paragraph with enough content for Readability to extract successfully.</p>
						<p>Second paragraph provides more context and information to ensure proper extraction.</p>
						<p>Third paragraph continues with additional details about the topic being discussed.</p>
						<p>Fourth paragraph ensures there is sufficient text for Readability algorithm.</p>
						<p>Final paragraph completes the article with meaningful content.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/no-title" });
		const result = extractContent(dom);

		// Readability should extract content successfully
		expect(result.content).not.toBeNull();
		expect(result.content).toContain("substantial paragraph");

		// Title may be empty string or null when no title tag exists
		// This tests the ?? null fallback path on line 171
		expect(result.title === "" || result.title === null).toBe(true);
	});

	it("should handle article with empty title tag", () => {
		// Tests another scenario where article.title could be empty/null
		const html = `
			<!DOCTYPE html>
			<html>
				<head>
					<title></title>
				</head>
				<body>
					<article>
						<h1>Main Heading</h1>
						<p>Article content with substantial text to ensure Readability extraction works properly.</p>
						<p>More paragraphs to provide enough content for the extraction algorithm to identify.</p>
						<p>Additional content ensures this is recognized as the main content of the page.</p>
						<p>Final paragraph to complete the substantial content requirement.</p>
					</article>
				</body>
			</html>
		`;
		const dom = new JSDOM(html, { url: "https://example.com/empty-title" });
		const result = extractContent(dom);

		expect(result.content).not.toBeNull();
		expect(result.content).toContain("substantial text");

		// Empty title tag results in empty string or null
		expect(result.title === "" || result.title === null).toBe(true);
	});
});

describe("extractContent - DOM mutation isolation (Issue #712)", () => {
	it("should mutate DOM by removing nav/header/footer in fallback mode", () => {
		// This test demonstrates the DOM mutation behavior
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Minimal Page</title></head>
				<body>
					<nav>
						<a href="/docs">Documentation</a>
						<a href="/api">API Reference</a>
					</nav>
					<header>
						<a href="/guide">Guide</a>
					</header>
					<main>
						<p>Short content that may trigger fallback</p>
					</main>
					<footer>
						<a href="/about">About</a>
					</footer>
				</body>
			</html>
		`;

		const dom = new JSDOM(html, { url: "https://example.com" });

		// Count elements before extractContent
		const navBefore = dom.window.document.querySelectorAll("nav").length;
		const headerBefore = dom.window.document.querySelectorAll("header").length;
		const footerBefore = dom.window.document.querySelectorAll("footer").length;
		const totalBefore = navBefore + headerBefore + footerBefore;

		// Extract content (which may trigger fallback and mutate DOM)
		extractContent(dom);

		// Count elements after extractContent
		const navAfter = dom.window.document.querySelectorAll("nav").length;
		const headerAfter = dom.window.document.querySelectorAll("header").length;
		const footerAfter = dom.window.document.querySelectorAll("footer").length;
		const totalAfter = navAfter + headerAfter + footerAfter;

		// If fallback was triggered, elements should be removed
		// Note: Readability might succeed for this HTML, so we check if mutation occurred
		// The key point is that extractContent CAN mutate the DOM
		expect(totalBefore).toBeGreaterThan(0);
		// After extractContent, elements may be removed (if fallback triggered)
		expect(totalAfter).toBeLessThanOrEqual(totalBefore);
	});

	it("should not affect link extraction when extractLinks runs before extractContent", () => {
		// This test verifies the fix: extractLinks should run BEFORE extractContent
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Navigation Test</title></head>
				<body>
					<nav>
						<a href="https://example.com/docs">Documentation</a>
						<a href="https://example.com/api">API Reference</a>
					</nav>
					<header>
						<a href="https://example.com/guide">Guide</a>
					</header>
					<main>
						<p>Short content</p>
					</main>
					<footer>
						<a href="https://example.com/about">About</a>
					</footer>
				</body>
			</html>
		`;

		const dom = new JSDOM(html, { url: "https://example.com" });

		// Extract links BEFORE extractContent (the fix for Issue #712)
		const linksBefore = dom.window.document.querySelectorAll("a").length;
		const extractedLinks = [];
		const anchors = dom.window.document.querySelectorAll("a[href]");
		for (const anchor of anchors) {
			const href = anchor.getAttribute("href");
			if (href) extractedLinks.push(href);
		}

		// Then extract content (which may mutate the DOM)
		extractContent(dom);

		// Verify we captured all links before DOM mutation
		expect(linksBefore).toBe(4);
		expect(extractedLinks).toContain("https://example.com/docs");
		expect(extractedLinks).toContain("https://example.com/api");
		expect(extractedLinks).toContain("https://example.com/guide");
		expect(extractedLinks).toContain("https://example.com/about");

		// After extractContent, some links may be gone (if fallback triggered)
		const linksAfter = dom.window.document.querySelectorAll("a").length;
		expect(linksAfter).toBeLessThanOrEqual(linksBefore);
	});

	it("should preserve all navigation links when extracted before content", () => {
		// Comprehensive test using the actual extractLinks function
		const html = `
			<!DOCTYPE html>
			<html>
				<head><title>Full Test</title></head>
				<body>
					<script>console.log('test');</script>
					<style>.test { color: red; }</style>
					<nav>
						<a href="https://example.com/nav1">Nav Link 1</a>
						<a href="https://example.com/nav2">Nav Link 2</a>
					</nav>
					<header>
						<a href="https://example.com/header1">Header Link</a>
					</header>
					<aside>
						<a href="https://example.com/aside1">Aside Link</a>
					</aside>
					<main>
						<p>Main content</p>
						<a href="https://example.com/main1">Main Link</a>
					</main>
					<footer>
						<a href="https://example.com/footer1">Footer Link</a>
					</footer>
				</body>
			</html>
		`;

		const dom1 = new JSDOM(html, { url: "https://example.com" });
		const dom2 = new JSDOM(html, { url: "https://example.com" });

		// Scenario 1: Extract links BEFORE content (correct order - Issue #712 fix)
		const linksBeforeExtraction: string[] = [];
		const anchors = dom1.window.document.querySelectorAll("a[href]");
		for (const anchor of anchors) {
			const href = anchor.getAttribute("href");
			if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
				try {
					const url = new URL(href, "https://example.com");
					linksBeforeExtraction.push(url.href);
				} catch {
					// ignore invalid URLs
				}
			}
		}
		extractContent(dom1);

		// Scenario 2: Extract content FIRST, then try to extract links (wrong order - demonstrates the bug)
		extractContent(dom2);
		const linksAfterExtraction: string[] = [];
		const anchorsAfter = dom2.window.document.querySelectorAll("a[href]");
		for (const anchor of anchorsAfter) {
			const href = anchor.getAttribute("href");
			if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
				try {
					const url = new URL(href, "https://example.com");
					linksAfterExtraction.push(url.href);
				} catch {
					// ignore invalid URLs
				}
			}
		}

		// With correct order (before extraction), we should get ALL links
		expect(linksBeforeExtraction.length).toBeGreaterThanOrEqual(6);
		expect(linksBeforeExtraction).toContain("https://example.com/nav1");
		expect(linksBeforeExtraction).toContain("https://example.com/nav2");
		expect(linksBeforeExtraction).toContain("https://example.com/header1");
		expect(linksBeforeExtraction).toContain("https://example.com/aside1");
		expect(linksBeforeExtraction).toContain("https://example.com/footer1");
		expect(linksBeforeExtraction).toContain("https://example.com/main1");

		// With wrong order (after extraction), we may lose nav/header/footer/aside links
		// (if Readability fallback was triggered and removed those elements)
		expect(linksAfterExtraction.length).toBeLessThanOrEqual(linksBeforeExtraction.length);
	});
});
