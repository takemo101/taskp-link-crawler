import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../../src/parser/converter.js";

describe("htmlToMarkdown", () => {
	it("should convert basic HTML to Markdown", () => {
		const html = "<h1>Heading</h1><p>Paragraph text</p>";
		const result = htmlToMarkdown(html);

		expect(result).toContain("# Heading");
		expect(result).toContain("Paragraph text");
	});

	it("should convert headings correctly", () => {
		const html = `
			<h1>Heading 1</h1>
			<h2>Heading 2</h2>
			<h3>Heading 3</h3>
			<h4>Heading 4</h4>
			<h5>Heading 5</h5>
			<h6>Heading 6</h6>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("# Heading 1");
		expect(result).toContain("## Heading 2");
		expect(result).toContain("### Heading 3");
		expect(result).toContain("#### Heading 4");
		expect(result).toContain("##### Heading 5");
		expect(result).toContain("###### Heading 6");
	});

	it("should convert links to Markdown format", () => {
		const html = '<a href="https://example.com">Link Text</a>';
		const result = htmlToMarkdown(html);

		expect(result).toContain("[Link Text](https://example.com)");
	});

	it("should remove empty links", () => {
		const html = `
			<p>Some text <a href="https://example.com"></a> more text</p>
			<p>Another <a href="https://example.com">  </a> paragraph</p>
		`;
		const result = htmlToMarkdown(html);

		expect(result).not.toContain("[]");
		expect(result).not.toContain("[ ]");
		expect(result).toContain("Some text");
		expect(result).toContain("more text");
	});

	it("should convert lists to Markdown", () => {
		const html = `
			<ul>
				<li>Item 1</li>
				<li>Item 2</li>
				<li>Item 3</li>
			</ul>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("* Item 1");
		expect(result).toContain("* Item 2");
		expect(result).toContain("* Item 3");
	});

	it("should convert ordered lists to Markdown", () => {
		const html = `
			<ol>
				<li>First</li>
				<li>Second</li>
				<li>Third</li>
			</ol>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("1. First");
		expect(result).toContain("2. Second");
		expect(result).toContain("3. Third");
	});

	it("should convert code blocks with fenced style", () => {
		const html = `
			<pre><code>const x = 1;
const y = 2;</code></pre>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("const x = 1;");
		expect(result).toContain("const y = 2;");
	});

	it("should convert inline code", () => {
		const html = "<p>Use the <code>console.log()</code> function</p>";
		const result = htmlToMarkdown(html);

		expect(result).toContain("`console.log()`");
	});

	it("should handle emphasis and strong text", () => {
		const html = `
			<p><em>Italic</em> and <strong>Bold</strong> text</p>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("_Italic_");
		expect(result).toContain("**Bold**");
	});

	it("should convert blockquotes", () => {
		const html = "<blockquote>This is a quote</blockquote>";
		const result = htmlToMarkdown(html);

		expect(result).toContain("> This is a quote");
	});

	it("should normalize multiple spaces to single space", () => {
		const html = "<p>Multiple   spaces   here</p>";
		const result = htmlToMarkdown(html);

		expect(result).not.toContain("   ");
		expect(result).toContain("Multiple spaces here");
	});

	it("should remove space before comma", () => {
		const html = "<p>Items , more items , end</p>";
		const result = htmlToMarkdown(html);

		expect(result).not.toContain(" ,");
		expect(result).toContain("Items, more items, end");
	});

	it("should remove space before period", () => {
		const html = "<p>Sentence . Another .</p>";
		const result = htmlToMarkdown(html);

		expect(result).not.toContain(" .");
		expect(result).toContain("Sentence. Another.");
	});

	it("should normalize multiple newlines to double newline", () => {
		const html = `
			<p>Paragraph 1</p>
			<br><br><br>
			<p>Paragraph 2</p>
		`;
		const result = htmlToMarkdown(html);

		// Should not have 3+ consecutive newlines
		expect(result).not.toMatch(/\n{3,}/);
	});

	it("should handle tables with GFM", () => {
		const html = `
			<table>
				<tr><th>Name</th><th>Age</th></tr>
				<tr><td>John</td><td>30</td></tr>
				<tr><td>Jane</td><td>25</td></tr>
			</table>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("| Name | Age |");
		expect(result).toContain("| --- | --- |");
		expect(result).toContain("| John | 30 |");
		expect(result).toContain("| Jane | 25 |");
	});

	it("should handle strikethrough with GFM", () => {
		const html = "<p>This is <del>deleted</del> text</p>";
		const result = htmlToMarkdown(html);

		expect(result).toContain("~deleted~");
	});

	it("should trim whitespace from result", () => {
		const html = "\n\n\n<p>Content</p>\n\n\n";
		const result = htmlToMarkdown(html);

		expect(result).not.toMatch(/^\s/);
		expect(result).not.toMatch(/\s$/);
	});

	it("should handle empty input", () => {
		const result = htmlToMarkdown("");
		expect(result).toBe("");
	});

	it("should handle complex nested structure", () => {
		const html = `
			<article>
				<h2>Title</h2>
				<p>Introduction with <a href="https://example.com">link</a> and <code>code</code>.</p>
				<ul>
					<li>Item with <strong>bold</strong></li>
					<li>Item with <em>italic</em></li>
				</ul>
			</article>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("## Title");
		expect(result).toContain("Introduction with");
		expect(result).toContain("[link](https://example.com)");
		expect(result).toContain("`code`");
		expect(result).toContain("* Item with **bold**");
		expect(result).toContain("* Item with _italic_");
	});

	it("should handle horizontal rules", () => {
		const html = "<p>Before</p><hr><p>After</p>";
		const result = htmlToMarkdown(html);

		expect(result).toContain("* * *");
	});

	it("should handle images", () => {
		const html = '<img src="image.png" alt="Description">';
		const result = htmlToMarkdown(html);

		expect(result).toContain("![Description](image.png)");
	});

	it("should handle line breaks", () => {
		const html = "<p>Line 1<br>Line 2</p>";
		const result = htmlToMarkdown(html);

		expect(result).toContain("Line 1");
		expect(result).toContain("Line 2");
	});
});

describe("htmlToMarkdown - syntax highlighter support", () => {
	it("should convert hljs div to code block", () => {
		const html = `
			<div class="hljs">
				<pre><code>function hello() {
  return "world";
}</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("function hello()");
		expect(result).toContain('return "world"');
	});

	it("should convert data-rehype-pretty-code-fragment to code block", () => {
		const html = `
			<div data-rehype-pretty-code-fragment="">
				<pre data-language="bash"><code>npx create-next-app@latest</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("npx create-next-app@latest");
	});

	it("should convert figure with data-rehype-pretty-code-figure to code block", () => {
		const html = `
			<figure data-rehype-pretty-code-figure="">
				<pre data-language="tsx"><code>export default function App() {
  return <div>Hello</div>;
}</code></pre>
			</figure>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("export default function App()");
	});

	it("should convert prism-code div to code block", () => {
		const html = `
			<div class="prism-code">
				<pre><code class="language-javascript">console.log("hello");</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain('console.log("hello")');
	});

	it("should convert shiki div to code block", () => {
		const html = `
			<div class="shiki" data-language="rust">
				<pre><code>fn main() {
    println!("Hello, world!");
}</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("fn main()");
		expect(result).toContain('println!("Hello, world!")');
	});

	it("should convert highlight div to code block", () => {
		const html = `
			<div class="highlight">
				<pre><code>gem install rails</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("gem install rails");
	});

	it("should convert code-block div to code block", () => {
		const html = `
			<div class="code-block">
				<pre><code>docker run hello-world</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("docker run hello-world");
	});

	it("should detect language from class name", () => {
		const html = `
			<div class="hljs">
				<pre><code class="language-python">print("hello")</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```python");
		expect(result).toContain('print("hello")');
	});

	it("should detect language from data-language attribute", () => {
		const html = `
			<div data-rehype-pretty-code-fragment="" data-language="typescript">
				<pre><code>const x: number = 42;</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("const x: number = 42");
	});

	it("should handle code block without language", () => {
		const html = `
			<div class="hljs">
				<pre><code>some code here</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("some code here");
	});

	it("should detect language from child pre element with data-language attribute", () => {
		const html = `
			<div class="hljs">
				<pre data-language="rust"><code>fn main() { println!("Hello"); }</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```rust");
		expect(result).toContain("fn main()");
	});

	it("should extract direct text content when no pre or code elements exist", () => {
		const html = `
			<div class="hljs">direct code text without tags</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("direct code text without tags");
	});

	it("should detect language from child code element class", () => {
		const html = `
			<div class="highlight">
				<pre><code class="language-ruby">puts "Hello World"</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```ruby");
		expect(result).toContain('puts "Hello World"');
	});

	it("should detect language from parent div class with language pattern", () => {
		const html = `
			<div class="highlight language-python">
				<pre><code>print("hello")</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```python");
		expect(result).toContain('print("hello")');
	});

	it("should detect language from parent div class with lang pattern", () => {
		const html = `
			<div class="code-block lang-typescript">
				<pre><code>const x: number = 42;</code></pre>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```typescript");
		expect(result).toContain("const x: number = 42");
	});

	it("should extract code content from code element without pre element", () => {
		const html = `
			<div class="hljs">
				<code>inline code without pre</code>
			</div>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```");
		expect(result).toContain("inline code without pre");
	});

	it("should convert Torchlight code block and strip line numbers", () => {
		const html = `
			<pre><code data-theme="dracula" data-lang="php" class="torchlight">
				<div class="line"><span class="line-number">1</span><span>test('sum', function () {</span></div>
				<div class="line"><span class="line-number">2</span><span>    $result = sum(1, 2);</span></div>
				<div class="line"><span class="line-number">3</span><span>    expect($result)->toBe(3);</span></div>
				<div class="line"><span class="line-number">4</span><span>});</span></div>
			</code></pre>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```php");
		expect(result).toContain("test('sum', function () {");
		expect(result).toContain("expect($result)->toBe(3);");
		expect(result).not.toMatch(/^1test/m);
		expect(result).not.toMatch(/^2\s/m);
		expect(result).not.toMatch(/^3\s/m);
		expect(result).not.toMatch(/^4\}/m);
	});

	it("should handle Torchlight code block with data-lang attribute for language detection", () => {
		const html = `
			<pre><code data-lang="javascript" class="torchlight">
				<div class="line"><span class="line-number">1</span><span>console.log("hello");</span></div>
			</code></pre>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("```javascript");
		expect(result).toContain('console.log("hello");');
		expect(result).not.toContain("1console");
	});

	it("should decode decimal numeric HTML entities in code blocks with line numbers", () => {
		const html = `
			<pre><code class="torchlight">
				<div class="line"><span class="line-number">1</span><span>if (a &#60; b &#38;&#38; c &#62; d) &#123;</span></div>
				<div class="line"><span class="line-number">2</span><span>    return &#34;hello&#34;;</span></div>
				<div class="line"><span class="line-number">3</span><span>&#125;</span></div>
			</code></pre>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain("if (a < b && c > d) {");
		expect(result).toContain('return "hello";');
		expect(result).toContain("}");
		expect(result).not.toContain("&#60;");
		expect(result).not.toContain("&#123;");
		expect(result).not.toContain("&#125;");
	});

	it("should not double-decode &amp;lt; in code blocks with line numbers", () => {
		const html = `
			<pre><code class="torchlight">
				<div class="line"><span class="line-number">1</span><span>Use &amp;lt;br&amp;gt; for line breaks</span></div>
			</code></pre>
		`;
		const result = htmlToMarkdown(html);
		expect(result).toContain("Use &lt;br&gt; for line breaks");
		expect(result).not.toContain("Use <br> for line breaks");
	});

	it("should decode hexadecimal numeric HTML entities in code blocks with line numbers", () => {
		const html = `
			<pre><code class="torchlight">
				<div class="line"><span class="line-number">1</span><span>const obj = &#x7B; key: &#x22;value&#x22; &#x7D;;</span></div>
				<div class="line"><span class="line-number">2</span><span>if (x &#x3C; 10) &#x7B; return; &#x7D;</span></div>
			</code></pre>
		`;
		const result = htmlToMarkdown(html);

		expect(result).toContain('const obj = { key: "value" };');
		expect(result).toContain("if (x < 10) { return; }");
		expect(result).not.toContain("&#x7B;");
		expect(result).not.toContain("&#x3C;");
	});
});
