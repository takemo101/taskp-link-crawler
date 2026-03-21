import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type BunAPI,
	BunRuntimeAdapter,
	createRuntimeAdapter,
	NodeRuntimeAdapter,
} from "../../src/utils/runtime.js";

describe("BunRuntimeAdapter", () => {
	describe("spawn", () => {
		it("should spawn command successfully", async () => {
			// Mock Bun.spawn
			const mockStdout = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("stdout content"));
					controller.close();
				},
			});
			const mockStderr = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(""));
					controller.close();
				},
			});

			const mockProc = {
				stdout: mockStdout,
				stderr: mockStderr,
				exited: Promise.resolve(0),
			};

			const mockBunApi: BunAPI = {
				spawn: vi.fn().mockReturnValue(mockProc),
				sleep: vi.fn(),
				file: vi.fn(),
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			const result = await adapter.spawn("echo", ["hello"]);

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe("stdout content");
			expect(result.stderr).toBe("");
		});

		it("should handle command failure", async () => {
			const mockStdout = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(""));
					controller.close();
				},
			});
			const mockStderr = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("error message"));
					controller.close();
				},
			});

			const mockProc = {
				stdout: mockStdout,
				stderr: mockStderr,
				exited: Promise.resolve(1),
			};

			const mockBunApi: BunAPI = {
				spawn: vi.fn().mockReturnValue(mockProc),
				sleep: vi.fn(),
				file: vi.fn(),
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			const result = await adapter.spawn("false", []);

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toBe("error message");
		});

		it("should handle spawn error", async () => {
			const mockBunApi: BunAPI = {
				spawn: vi.fn().mockImplementation(() => {
					throw new Error("command not found");
				}),
				sleep: vi.fn(),
				file: vi.fn(),
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			const result = await adapter.spawn("nonexistent", []);

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(-1);
			expect(result.stderr).toBe("command not found");
		});

		it("should handle spawn error with non-Error object", async () => {
			const mockBunApi: BunAPI = {
				spawn: vi.fn().mockImplementation(() => {
					// eslint-disable-next-line @typescript-eslint/only-throw-error
					throw "string error"; // 文字列をスロー
				}),
				sleep: vi.fn(),
				file: vi.fn(),
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			const result = await adapter.spawn("nonexistent", []);

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(-1);
			expect(result.stderr).toBe("command not found");
		});
	});

	describe("sleep", () => {
		it("should call Bun.sleep", async () => {
			const mockSleep = vi.fn().mockResolvedValue(undefined);
			const mockBunApi: BunAPI = {
				spawn: vi.fn(),
				sleep: mockSleep,
				file: vi.fn().mockReturnValue({
					text: vi.fn().mockResolvedValue("file content"),
				}),
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			await adapter.sleep(100);

			expect(mockSleep).toHaveBeenCalledWith(100);
		});
	});

	describe("readFile", () => {
		it("should read file content", async () => {
			const mockText = vi.fn().mockResolvedValue("file content");
			const mockFile = vi.fn().mockReturnValue({
				text: mockText,
			});
			const mockBunApi: BunAPI = {
				spawn: vi.fn(),
				sleep: vi.fn(),
				file: mockFile,
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			const result = await adapter.readFile("/path/to/file.txt");

			expect(result).toBe("file content");
			expect(mockFile).toHaveBeenCalledWith("/path/to/file.txt");
		});
	});

	describe("cwd", () => {
		it("should return current working directory", () => {
			const mockBunApi: BunAPI = {
				spawn: vi.fn(),
				sleep: vi.fn(),
				file: vi.fn(),
			} as BunAPI;

			const adapter = new BunRuntimeAdapter(mockBunApi);
			const result = adapter.cwd();

			expect(result).toBe(process.cwd());
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});
	});
});

describe("NodeRuntimeAdapter", () => {
	let adapter: NodeRuntimeAdapter;

	beforeEach(() => {
		adapter = new NodeRuntimeAdapter();
	});

	describe("spawn", () => {
		it("should spawn command successfully", async () => {
			const result = await adapter.spawn("echo", ["hello"]);

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("hello");
			expect(result.stderr).toBe("");
		});

		it("should handle command failure", async () => {
			const result = await adapter.spawn("node", [
				"-e",
				"process.stderr.write('error'); process.exit(1)",
			]);

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toBe("error");
		});

		it("should handle non-existent command", async () => {
			const result = await adapter.spawn("nonexistent_command_xyz", []);

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(-1);
			expect(result.stderr.length).toBeGreaterThan(0);
		});
	});

	describe("sleep", () => {
		it("should sleep for specified duration", async () => {
			const start = Date.now();
			await adapter.sleep(50);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeGreaterThanOrEqual(45);
		});
	});

	describe("readFile", () => {
		it("should read file content", async () => {
			// Create a temporary file to read
			const { writeFile, unlink } = await import("node:fs/promises");
			const { join } = await import("node:path");
			const { tmpdir } = await import("node:os");

			const testFile = join(tmpdir(), `test-${Date.now()}.txt`);
			await writeFile(testFile, "test content", "utf-8");

			try {
				const result = await adapter.readFile(testFile);
				expect(result).toBe("test content");
			} finally {
				await unlink(testFile).catch(() => {});
			}
		});

		it("should reject when file does not exist", async () => {
			const { join } = await import("node:path");
			const { tmpdir } = await import("node:os");

			const nonExistentFile = join(tmpdir(), `non-existent-${Date.now()}.txt`);

			await expect(adapter.readFile(nonExistentFile)).rejects.toThrow();
		});
	});

	describe("cwd", () => {
		it("should return current working directory", () => {
			const result = adapter.cwd();

			expect(result).toBe(process.cwd());
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});
	});
});

describe("createRuntimeAdapter", () => {
	it("should return BunRuntimeAdapter when Bun is defined", () => {
		// Bunがすでに定義されている環境（Bunランタイム）でテストする
		// この環境ではBunは常に定義されているため、単純に実行して型を確認
		const adapter = createRuntimeAdapter();

		// Bunランタイムで実行している場合はBunRuntimeAdapterが返される
		if (typeof Bun !== "undefined") {
			expect(adapter).toBeInstanceOf(BunRuntimeAdapter);
		} else {
			// Node.js環境ではNodeRuntimeAdapterが返される
			expect(adapter).toBeInstanceOf(NodeRuntimeAdapter);
		}
	});

	it("should return NodeRuntimeAdapter when Bun is undefined", () => {
		// このテストはNode.js環境でのみ意味を持つ
		// Bun環境では常にBunが定義されているため、スキップまたは別の検証を行う
		if (typeof Bun === "undefined") {
			const adapter = createRuntimeAdapter();
			expect(adapter).toBeInstanceOf(NodeRuntimeAdapter);
		} else {
			// Bun環境では、createRuntimeAdapterがBunRuntimeAdapterを返すことを確認
			const adapter = createRuntimeAdapter();
			expect(adapter).toBeInstanceOf(BunRuntimeAdapter);
		}
	});

	it("should return NodeRuntimeAdapter when Bun is not available (mocked)", () => {
		vi.stubGlobal("Bun", undefined);
		const adapter = createRuntimeAdapter();
		expect(adapter).toBeInstanceOf(NodeRuntimeAdapter);
		// vi.stubGlobal は restoreMocks: true（vitest.config.ts）により自動復元される
	});
});
