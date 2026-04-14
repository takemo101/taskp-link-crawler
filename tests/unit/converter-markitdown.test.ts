import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createFakeWorkerSpawn(responses: string[]) {
	const spawn = vi.fn(() => {
		const stdout = new PassThrough();
		const stderr = new PassThrough();
		let buffer = "";
		let responseIndex = 0;
		const stdin = new Writable({
			write(chunk, _encoding, callback) {
				buffer += chunk.toString();
				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.slice(0, newlineIndex).trim();
					buffer = buffer.slice(newlineIndex + 1);
					if (line) {
						const request = JSON.parse(line) as { id: number };
						const markdown = responses[responseIndex++] ?? responses[responses.length - 1] ?? "";
						stdout.write(`${JSON.stringify({ id: request.id, ok: true, markdown })}\n`);
					}
					newlineIndex = buffer.indexOf("\n");
				}
				callback();
			},
		});

		const child = {
			stdout,
			stderr,
			stdin,
			on: vi.fn(),
			once(event: string, handler: (...args: unknown[]) => void) {
				if (event === "spawn") {
					queueMicrotask(() => {
						handler();
						stdout.write(`${JSON.stringify({ ready: true })}\n`);
					});
				}
				return this;
			},
			removeListener: vi.fn(),
			kill: vi.fn(),
		};

		return child;
	});

	return spawn;
}

describe("htmlToMarkdown - MarkItDown default", () => {
	beforeEach(() => {
		process.env.LINK_CRAWLER_ENABLE_MARKITDOWN_IN_TESTS = "1";
		vi.resetModules();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		delete process.env.LINK_CRAWLER_ENABLE_MARKITDOWN_IN_TESTS;
	});

	it("uses one long-lived MarkItDown worker across multiple conversions", async () => {
		const spawn = createFakeWorkerSpawn([
			"# Converted by MarkItDown\n\nBody text\n",
			"# Converted again\n\nSecond body\n",
		]);
		vi.doMock("node:child_process", () => ({ spawn }));

		const { htmlToMarkdown, resetMarkItDownWorkerForTests } = await import(
			"../../src/parser/converter.js"
		);

		const first = await htmlToMarkdown("<h1>Ignored</h1><p>Ignored body</p>");
		const second = await htmlToMarkdown("<h1>Ignored 2</h1><p>Ignored body 2</p>");

		expect(first).toBe("# Converted by MarkItDown\n\nBody text");
		expect(second).toBe("# Converted again\n\nSecond body");
		expect(spawn).toHaveBeenCalledTimes(1);

		resetMarkItDownWorkerForTests();
	});

	it("falls back to Turndown when the MarkItDown worker cannot start", async () => {
		const spawn = vi.fn(() => {
			const child = {
				stdout: new PassThrough(),
				stderr: new PassThrough(),
				stdin: new Writable({
					write(_chunk, _encoding, callback) {
						callback();
					},
				}),
				on: vi.fn(),
				once(event: string, handler: (...args: unknown[]) => void) {
					if (event === "error") {
						queueMicrotask(() => handler(Object.assign(new Error("missing"), { code: "ENOENT" })));
					}
					return this;
				},
				removeListener: vi.fn(),
				kill: vi.fn(),
			};
			return child;
		});
		vi.doMock("node:child_process", () => ({ spawn }));

		const { htmlToMarkdown, resetMarkItDownWorkerForTests } = await import(
			"../../src/parser/converter.js"
		);
		const result = await htmlToMarkdown("<h1>Heading</h1><p>Paragraph text</p>");

		expect(result).toContain("# Heading");
		expect(result).toContain("Paragraph text");
		expect(spawn).toHaveBeenCalledTimes(2);

		resetMarkItDownWorkerForTests();
	});
});
