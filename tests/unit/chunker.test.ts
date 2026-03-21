import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Chunker } from "../../src/output/chunker.js";

const testOutputDir = "./test-output-chunker";

describe("Chunker", () => {
	beforeEach(() => {
		mkdirSync(testOutputDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testOutputDir, { recursive: true, force: true });
	});

	describe("chunk", () => {
		it("should return empty array for empty markdown", () => {
			const chunker = new Chunker(testOutputDir);
			const result = chunker.chunk("");
			expect(result).toEqual([]);
		});

		it("should return single chunk for markdown without H1", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = "Some content without heading.\n\nMore content.";
			const result = chunker.chunk(markdown);
			expect(result).toHaveLength(1);
			expect(result[0]).toBe(markdown);
		});

		it("should split markdown by H1 headings", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `# First Section

Content of first section.

# Second Section

Content of second section.`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("# First Section");
			expect(result[0]).toContain("Content of first section.");
			expect(result[1]).toContain("# Second Section");
			expect(result[1]).toContain("Content of second section.");
		});

		it("should handle multiple H1 headings", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `# Section 1
Content 1
# Section 2
Content 2
# Section 3
Content 3`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(3);
			expect(result[0]).toContain("# Section 1");
			expect(result[1]).toContain("# Section 2");
			expect(result[2]).toContain("# Section 3");
		});

		it("should not split by H2 or lower headings", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `# Main Section

## Sub Section

Content here.

### Deep Section

More content.

# Another Main Section

Final content.`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("## Sub Section");
			expect(result[0]).toContain("### Deep Section");
			expect(result[1]).toContain("# Another Main Section");
		});

		it("should handle frontmatter correctly", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `---
title: Test Document
---

# First Section

Content.

# Second Section

More content.`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("---");
			expect(result[0]).toContain("title: Test Document");
			expect(result[0]).toContain("# First Section");
		});

		it("should trim whitespace from chunks", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `
# Section

Content.

# Another Section

More content.
`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(2);
			expect(result[0]).not.toMatch(/^\s/);
			expect(result[0]).not.toMatch(/\s$/);
		});

		it("should handle full.md format with --- separators (3+ pages)", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `# Page 1

> Source: https://example.com/page1

Content of page 1.

---

# Page 2

> Source: https://example.com/page2

Content of page 2.

---

# Page 3

> Source: https://example.com/page3

Content of page 3.`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(3);
			expect(result[0]).toContain("# Page 1");
			expect(result[1]).toContain("# Page 2");
			expect(result[2]).toContain("# Page 3");
			expect(result[0]).toContain("Content of page 1");
			expect(result[1]).toContain("Content of page 2");
			expect(result[2]).toContain("Content of page 3");
		});

		it("should handle 4 pages with --- separators", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `# Page 1
Content 1.

---

# Page 2
Content 2.

---

# Page 3
Content 3.

---

# Page 4
Content 4.`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(4);
			expect(result[0]).toContain("# Page 1");
			expect(result[1]).toContain("# Page 2");
			expect(result[2]).toContain("# Page 3");
			expect(result[3]).toContain("# Page 4");
		});

		it("should handle frontmatter at start and --- separators later", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `---
title: Test Document
---

# Page 1
Content 1.

---

# Page 2
Content 2.`;

			const result = chunker.chunk(markdown);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("title: Test Document");
			expect(result[0]).toContain("# Page 1");
			expect(result[1]).toContain("# Page 2");
		});
	});

	describe("writeChunks", () => {
		it("should return empty array for empty chunks", () => {
			const chunker = new Chunker(testOutputDir);
			const result = chunker.writeChunks([]);
			expect(result).toEqual([]);
		});

		it("should write chunks with 3-digit zero padding", () => {
			const chunker = new Chunker(testOutputDir);
			const chunks = ["# Chunk 1", "# Chunk 2", "# Chunk 3"];

			const result = chunker.writeChunks(chunks);

			expect(result).toHaveLength(3);
			expect(result[0]).toContain("chunk-001.md");
			expect(result[1]).toContain("chunk-002.md");
			expect(result[2]).toContain("chunk-003.md");
		});

		it("should write chunk content to files", () => {
			const chunker = new Chunker(testOutputDir);
			const chunks = ["# First Chunk\n\nContent 1", "# Second Chunk\n\nContent 2"];

			chunker.writeChunks(chunks);

			const content1 = readFileSync(join(testOutputDir, "chunks", "chunk-001.md"), "utf-8");
			const content2 = readFileSync(join(testOutputDir, "chunks", "chunk-002.md"), "utf-8");

			expect(content1).toBe("# First Chunk\n\nContent 1");
			expect(content2).toBe("# Second Chunk\n\nContent 2");
		});

		it("should create chunks directory", () => {
			const chunker = new Chunker(testOutputDir);
			chunker.writeChunks(["# Test"]);

			const stats = readFileSync(join(testOutputDir, "chunks", "chunk-001.md"));
			expect(stats).toBeDefined();
		});

		it("should remove old chunk files on re-write", () => {
			const chunker = new Chunker(testOutputDir);

			// 1回目: 3つのチャンクを書き込み
			const firstChunks = ["# Chunk 1", "# Chunk 2", "# Chunk 3"];
			chunker.writeChunks(firstChunks);

			// 3つのファイルが存在することを確認
			expect(existsSync(join(testOutputDir, "chunks", "chunk-001.md"))).toBe(true);
			expect(existsSync(join(testOutputDir, "chunks", "chunk-002.md"))).toBe(true);
			expect(existsSync(join(testOutputDir, "chunks", "chunk-003.md"))).toBe(true);

			// 2回目: 2つのチャンクを書き込み
			const secondChunks = ["# New Chunk 1", "# New Chunk 2"];
			chunker.writeChunks(secondChunks);

			// 2つのファイルのみ存在することを確認（3つ目は削除されている）
			expect(existsSync(join(testOutputDir, "chunks", "chunk-001.md"))).toBe(true);
			expect(existsSync(join(testOutputDir, "chunks", "chunk-002.md"))).toBe(true);
			expect(existsSync(join(testOutputDir, "chunks", "chunk-003.md"))).toBe(false);

			// 内容が更新されていることを確認
			const content1 = readFileSync(join(testOutputDir, "chunks", "chunk-001.md"), "utf-8");
			expect(content1).toBe("# New Chunk 1");
		});
	});

	describe("chunkAndWrite", () => {
		it("should chunk and write in one operation", () => {
			const chunker = new Chunker(testOutputDir);
			const markdown = `# Section 1

Content 1.

# Section 2

Content 2.`;

			const result = chunker.chunkAndWrite(markdown);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("chunk-001.md");
			expect(result[1]).toContain("chunk-002.md");

			const content1 = readFileSync(result[0], "utf-8");
			expect(content1).toContain("# Section 1");
		});

		it("should return empty array for empty markdown", () => {
			const chunker = new Chunker(testOutputDir);
			const result = chunker.chunkAndWrite("");
			expect(result).toEqual([]);
		});
	});
});
