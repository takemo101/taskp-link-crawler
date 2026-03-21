import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaywrightFetcher, parseCliOutput } from "../../src/crawler/fetcher.js";
import { DependencyError, FetchError, TimeoutError } from "../../src/errors.js";
import type { CrawlConfig } from "../../src/types.js";
import type { RuntimeAdapter, SpawnResult } from "../../src/utils/runtime.js";

// Mock node:fs - using simple inline mocks (Bun + Vitest compatible, no vi.importActual)
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	rmSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

// Get typed references to the mocked functions
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
const mockRmSync = fs.rmSync as ReturnType<typeof vi.fn>;

const createMockConfig = (overrides: Partial<CrawlConfig> = {}): CrawlConfig => ({
	startUrl: "https://example.com",
	maxDepth: 1,
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
	...overrides,
});

const createMockRuntime = (): RuntimeAdapter => ({
	spawn: vi.fn(),
	sleep: vi.fn(),
	readFile: vi.fn(),
	cwd: vi.fn().mockReturnValue("/mock/working/dir"),
});

beforeEach(() => {
	vi.clearAllMocks();
	mockExistsSync.mockReset();
	mockRmSync.mockReset();
});

describe("PlaywrightFetcher", () => {
	describe("constructor", () => {
		it("should initialize with provided config", () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			const fetcher = new PlaywrightFetcher(config, mockRuntime);

			expect(fetcher).toBeDefined();
		});

		it("should use default runtime when not provided", () => {
			const config = createMockConfig();
			const fetcher = new PlaywrightFetcher(config);

			expect(fetcher).toBeDefined();
		});

		it("should use custom path config when provided", () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			const pathConfig = {
				nodePaths: ["/custom/node"],
				cliPaths: ["/custom/playwright-cli"],
			};
			const fetcher = new PlaywrightFetcher(config, mockRuntime, pathConfig);

			expect(fetcher).toBeDefined();
		});
	});

	describe("checkPlaywrightCli", () => {
		it("should return true when playwright-cli is found", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "1.0.0",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			// Access private method through prototype
			const result = await (
				fetcher as unknown as { checkPlaywrightCli(): Promise<boolean> }
			).checkPlaywrightCli();

			expect(result).toBe(true);
		});

		it("should try multiple paths until finding playwright-cli", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount < 3) {
					return Promise.resolve({
						success: false,
						stdout: "",
						stderr: "command not found",
						exitCode: 1,
					} as SpawnResult);
				}
				return Promise.resolve({
					success: true,
					stdout: "1.0.0",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as { checkPlaywrightCli(): Promise<boolean> }
			).checkPlaywrightCli();

			expect(result).toBe(true);
			expect(mockRuntime.spawn).toHaveBeenCalledTimes(3);
		});

		it("should return false when playwright-cli is not found in any path", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: false,
				stdout: "",
				stderr: "command not found",
				exitCode: 1,
			} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as { checkPlaywrightCli(): Promise<boolean> }
			).checkPlaywrightCli();

			expect(result).toBe(false);
		});
	});

	describe("executeFetch", () => {
		it("should successfully fetch page content", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command (getHttpMetadata)
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Test Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string }>;
				}
			).executeFetch("https://example.com");

			expect(result.html).toBe("<html>Test Content</html>");
			expect(result.finalUrl).toBe("https://example.com");
			expect(result.contentType).toBe("text/html");
		});

		it("should use headed mode when configured", async () => {
			const config = createMockConfig({ headed: true });
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation((_cmd, args) => {
				callCount++;
				if (callCount === 1) {
					// Verify headed flag is passed
					expect(args).toContain("--headed");
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html></html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await (fetcher as unknown as { executeFetch(url: string): Promise<unknown> }).executeFetch(
				"https://example.com",
			);
		});

		it("should throw FetchError when page open fails", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: false,
				stdout: "",
				stderr: "Navigation failed",
				exitCode: 1,
			} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(
				(fetcher as unknown as { executeFetch(url: string): Promise<unknown> }).executeFetch(
					"https://example.com",
				),
			).rejects.toThrow(FetchError);
		});

		it("should throw FetchError when content retrieval fails", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML - fails
				return Promise.resolve({
					success: false,
					stdout: "",
					stderr: "Eval failed",
					exitCode: 1,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(
				(fetcher as unknown as { executeFetch(url: string): Promise<unknown> }).executeFetch(
					"https://example.com",
				),
			).rejects.toThrow(FetchError);
		});

		it("should wait for spaWait duration", async () => {
			const config = createMockConfig({ spaWait: 5000 });
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html></html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await (fetcher as unknown as { executeFetch(url: string): Promise<unknown> }).executeFetch(
				"https://example.com",
			);

			expect(mockRuntime.sleep).toHaveBeenCalledWith(5000);
		});

		it("should track redirect from HTTP to HTTPS", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command with http://
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href - returns https://
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com/"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Redirected</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string }>;
				}
			).executeFetch("http://example.com");

			expect(result.html).toBe("<html>Redirected</html>");
			expect(result.finalUrl).toBe("https://example.com/");
		});

		it("should track redirect to different path", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href - redirected to /new
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com/new"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>New Page</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string }>;
				}
			).executeFetch("https://example.com/old");

			expect(result.html).toBe("<html>New Page</html>");
			expect(result.finalUrl).toBe("https://example.com/new");
		});

		it("should fallback to input URL when location.href retrieval fails", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href - fails
					return Promise.resolve({
						success: false,
						stdout: "",
						stderr: "Eval failed",
						exitCode: 1,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string }>;
				}
			).executeFetch("https://example.com");

			expect(result.html).toBe("<html>Content</html>");
			expect(result.finalUrl).toBe("https://example.com");
		});

		it("should handle URL with query parameters after redirect", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href - with query params
					return Promise.resolve({
						success: true,
						stdout:
							'### Result\n"https://example.com/page?utm_source=test&ref=home"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Page with params</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string }>;
				}
			).executeFetch("https://example.com/page");

			expect(result.html).toBe("<html>Page with params</html>");
			expect(result.finalUrl).toBe("https://example.com/page?utm_source=test&ref=home");
		});

		it("should handle URL with fragment after redirect", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href - with fragment
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com/page#section"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Page with fragment</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string }>;
				}
			).executeFetch("https://example.com/page");

			expect(result.html).toBe("<html>Page with fragment</html>");
			expect(result.finalUrl).toBe("https://example.com/page#section");
		});

		it("should reject javascript: protocol", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
				}
			).executeFetch("javascript:alert('xss')");

			expect(result).toBeNull();
			// Verify that spawn was never called (URL rejected before any network activity)
			expect(mockRuntime.spawn).not.toHaveBeenCalled();
		});

		it("should reject file: protocol", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
				}
			).executeFetch("file:///etc/passwd");

			expect(result).toBeNull();
			expect(mockRuntime.spawn).not.toHaveBeenCalled();
		});

		it("should reject ftp: protocol", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
				}
			).executeFetch("ftp://ftp.example.com/file.txt");

			expect(result).toBeNull();
			expect(mockRuntime.spawn).not.toHaveBeenCalled();
		});

		it("should reject data: protocol", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
				}
			).executeFetch("data:text/html,<script>alert('xss')</script>");

			expect(result).toBeNull();
			expect(mockRuntime.spawn).not.toHaveBeenCalled();
		});

		it("should reject malformed URLs", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
				}
			).executeFetch("not-a-valid-url");

			expect(result).toBeNull();
			expect(mockRuntime.spawn).not.toHaveBeenCalled();
		});

		it("should accept http: protocol", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"http://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>HTTP Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string } | null>;
				}
			).executeFetch("http://example.com");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>HTTP Content</html>");
		});

		it("should accept https: protocol", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>HTTPS Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					executeFetch(
						url: string,
					): Promise<{ html: string; finalUrl: string; contentType: string } | null>;
				}
			).executeFetch("https://example.com");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>HTTPS Content</html>");
		});

		describe("URL validation enhancements", () => {
			it("should reject URLs longer than 2048 characters", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				const longUrl = `https://example.com/${"a".repeat(2048)}`;

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
					}
				).executeFetch(longUrl);

				expect(result).toBeNull();
				expect(mockRuntime.spawn).not.toHaveBeenCalled();
			});

			it("should accept URLs exactly at 2048 character limit", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				// Create URL with exactly 2048 characters
				const baseUrl = "https://example.com/";
				const padding = "a".repeat(2048 - baseUrl.length);
				const exactLimitUrl = baseUrl + padding;

				let callCount = 0;
				mockRuntime.spawn = vi.fn().mockImplementation(() => {
					callCount++;
					if (callCount === 1) {
						return Promise.resolve({
							success: true,
							stdout: "",
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}
					if (callCount === 2) {
						return Promise.resolve({
							success: true,
							stdout: "[Network](.playwright-cli/network.log)",
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}
					if (callCount === 3) {
						return Promise.resolve({
							success: true,
							stdout: `### Result\n"${exactLimitUrl}"\n### Ran Playwright code`,
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				});
				mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
				mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
				mockExistsSync.mockReturnValue(true);

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(
							url: string,
						): Promise<{ html: string; finalUrl: string; contentType: string } | null>;
					}
				).executeFetch(exactLimitUrl);

				expect(result).not.toBeNull();
			});

			it("should reject URLs with NULL character", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				const urlWithNull = "https://example.com/\x00path";

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
					}
				).executeFetch(urlWithNull);

				expect(result).toBeNull();
				expect(mockRuntime.spawn).not.toHaveBeenCalled();
			});

			it("should reject URLs with TAB character", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				const urlWithTab = "https://example.com/\tpath";

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
					}
				).executeFetch(urlWithTab);

				expect(result).toBeNull();
				expect(mockRuntime.spawn).not.toHaveBeenCalled();
			});

			it("should reject URLs with newline character", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				const urlWithNewline = "https://example.com/\npath";

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
					}
				).executeFetch(urlWithNewline);

				expect(result).toBeNull();
				expect(mockRuntime.spawn).not.toHaveBeenCalled();
			});

			it("should reject URLs with DEL character", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				const urlWithDel = "https://example.com/\x7fpath";

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(url: string): Promise<{ html: string; finalUrl: string } | null>;
					}
				).executeFetch(urlWithDel);

				expect(result).toBeNull();
				expect(mockRuntime.spawn).not.toHaveBeenCalled();
			});

			it("should accept URLs with normal query parameters and encoded characters", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();
				const normalUrl = "https://example.com/search?q=%E6%A4%9C%E7%B4%A2&lang=ja";

				let callCount = 0;
				mockRuntime.spawn = vi.fn().mockImplementation(() => {
					callCount++;
					if (callCount === 1) {
						return Promise.resolve({
							success: true,
							stdout: "",
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}
					if (callCount === 2) {
						return Promise.resolve({
							success: true,
							stdout: "[Network](.playwright-cli/network.log)",
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}
					if (callCount === 3) {
						return Promise.resolve({
							success: true,
							stdout: `### Result\n"${normalUrl}"\n### Ran Playwright code`,
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				});
				mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
				mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
				mockExistsSync.mockReturnValue(true);

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						executeFetch(
							url: string,
						): Promise<{ html: string; finalUrl: string; contentType: string } | null>;
					}
				).executeFetch(normalUrl);

				expect(result).not.toBeNull();
			});
		});
	});

	describe("fetch", () => {
		it("should initialize and fetch successfully", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli - version check
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 4) {
					// eval window.location.href
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>Content</html>");
		});

		it("should throw DependencyError when playwright-cli is not found", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: false,
				stdout: "",
				stderr: "command not found",
				exitCode: 1,
			} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(DependencyError);
		});

		it("should throw TimeoutError when request times out", async () => {
			const config = createMockConfig({ timeout: 100 });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				return new Promise((resolve) => {
					setTimeout(() => {
						resolve({
							success: true,
							stdout: "1.0.0",
							stderr: "",
							exitCode: 0,
						} as SpawnResult);
					}, 150); // Reduced from 1000ms to 150ms (just above timeout)
				});
			});

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(TimeoutError);
		});

		it("should only initialize once on multiple fetches", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// First call is checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount % 4 === 2) {
					// open commands (2, 6)
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount % 4 === 3) {
					// network commands (3, 7)
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount % 4 === 0) {
					// eval window.location.href (4, 8)
					return Promise.resolve({
						success: true,
						stdout: '### Result\n"https://example.com"\n### Ran Playwright code',
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval document.documentElement.outerHTML (5, 9)
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html></html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await fetcher.fetch("https://example.com");
			await fetcher.fetch("https://example.com/page2");

			// Should only check playwright cli once
			// 1 version check + 2*(open + network + eval URL + eval HTML) = 1 + 2*4 = 9
			expect(mockRuntime.spawn).toHaveBeenCalledTimes(9);
		});

		it("should wrap unknown errors in FetchError", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					stdout: "1.0.0",
					stderr: "",
					exitCode: 0,
				} as SpawnResult)
				.mockRejectedValue(new Error("Unexpected error"));

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchError);
		});

		it("should re-throw FetchError as-is", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					stdout: "1.0.0",
					stderr: "",
					exitCode: 0,
				} as SpawnResult)
				.mockResolvedValueOnce({
					success: false,
					stdout: "",
					stderr: "Navigation failed",
					exitCode: 1,
				} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(FetchError);
		});

		it("should re-throw TimeoutError as-is", async () => {
			const config = createMockConfig({ timeout: 50 });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					stdout: "1.0.0",
					stderr: "",
					exitCode: 0,
				} as SpawnResult)
				.mockImplementation(
					() =>
						new Promise((resolve) =>
							setTimeout(
								() =>
									resolve({
										success: true,
										stdout: "",
										stderr: "",
										exitCode: 0,
									} as SpawnResult),
								100, // Reduced from 1000ms to 100ms (2x timeout)
							),
						),
				);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(TimeoutError);
		});

		it("should cleanup session when timeout occurs", async () => {
			const config = createMockConfig({ timeout: 100 });
			const mockRuntime = createMockRuntime();
			const spawnCalls: string[][] = [];

			mockRuntime.spawn = vi.fn().mockImplementation((_cmd, args) => {
				spawnCalls.push([...args]);

				// version check は成功
				if (args.includes("--version")) {
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}

				// open コマンドは遅延してタイムアウトさせる
				if (args.includes("open")) {
					return new Promise((resolve) => {
						setTimeout(() => {
							resolve({
								success: true,
								stdout: "",
								stderr: "",
								exitCode: 0,
							} as SpawnResult);
						}, 150); // Reduced from 1000ms to 150ms
					});
				}

				// session-stop は即座に成功
				if (args.includes("session-stop")) {
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}

				return Promise.resolve({
					success: true,
					stdout: "",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});

			const fetcher = new PlaywrightFetcher(config, mockRuntime);

			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(TimeoutError);

			// session-stop が呼ばれたことを確認
			const sessionStopCalls = spawnCalls.filter((args) => args.includes("session-stop"));
			expect(sessionStopCalls.length).toBeGreaterThan(0);
		});

		it("should handle session-stop failure on timeout gracefully", async () => {
			const config = createMockConfig({ timeout: 100 });
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockImplementation((_cmd, args) => {
				// version check は成功
				if (args.includes("--version")) {
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}

				// open コマンドは遅延してタイムアウトさせる
				if (args.includes("open")) {
					return new Promise((resolve) => {
						setTimeout(() => {
							resolve({
								success: true,
								stdout: "",
								stderr: "",
								exitCode: 0,
							} as SpawnResult);
						}, 150); // Reduced from 1000ms to 150ms
					});
				}

				// session-stop は失敗
				if (args.includes("session-stop")) {
					return Promise.reject(new Error("Session already closed"));
				}

				return Promise.resolve({
					success: true,
					stdout: "",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});

			const fetcher = new PlaywrightFetcher(config, mockRuntime);

			// session-stop が失敗しても TimeoutError は throw される
			await expect(fetcher.fetch("https://example.com")).rejects.toThrow(TimeoutError);
		});
	});

	describe("close", () => {
		it("should close session successfully", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);
			mockExistsSync.mockReturnValue(true);
			mockRmSync.mockReturnValue(undefined);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await fetcher.close();

			expect(mockRuntime.spawn).toHaveBeenCalledWith(
				expect.any(String),
				["playwright-cli", "session-stop"],
				expect.any(String),
			);
		});

		it("should remove .playwright-cli directory when keepSession is false", async () => {
			const config = createMockConfig({ keepSession: false });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);
			mockExistsSync.mockReturnValue(true);
			mockRmSync.mockReturnValue(undefined);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await fetcher.close();

			expect(mockExistsSync).toHaveBeenCalled();
			expect(mockRmSync).toHaveBeenCalled();
		});

		it("should not remove .playwright-cli directory when keepSession is true", async () => {
			const config = createMockConfig({ keepSession: true });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await fetcher.close();

			// rmSync should not be called (directory should not be removed)
			expect(mockRmSync).not.toHaveBeenCalled();
		});

		it("should handle close session errors gracefully", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockRejectedValue(new Error("Session not found"));
			mockExistsSync.mockReturnValue(false);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			// Should not throw
			await expect(fetcher.close()).resolves.toBeUndefined();
		});

		it("should handle cleanup errors gracefully", async () => {
			const config = createMockConfig({ keepSession: false });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);
			mockExistsSync.mockReturnValue(true);
			mockRmSync.mockImplementation(() => {
				throw new Error("Permission denied");
			});

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			// Should not throw
			await expect(fetcher.close()).resolves.toBeUndefined();
		});
	});

	describe("timeout configuration", () => {
		it("should have timeout value in config", () => {
			const config = createMockConfig({ timeout: 5000 });
			expect(config.timeout).toBe(5000);
		});

		it("should have default timeout of 30000ms", () => {
			const config = createMockConfig();
			expect(config.timeout).toBe(30000);
		});

		it("should accept custom timeout value", () => {
			const config = createMockConfig({ timeout: 100 });
			expect(config.timeout).toBe(100);
		});
	});

	describe("keepSession configuration", () => {
		it("should have keepSession default to false", () => {
			const config = createMockConfig();
			expect(config.keepSession).toBe(false);
		});

		it("should accept keepSession true value", () => {
			const config = createMockConfig({ keepSession: true });
			expect(config.keepSession).toBe(true);
		});

		it("should accept keepSession false value", () => {
			const config = createMockConfig({ keepSession: false });
			expect(config.keepSession).toBe(false);
		});
	});

	describe("getHttpMetadata", () => {
		it("should normalize relative paths within cwd", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			// Test with path within cwd
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(200);
			expect(result.contentType).toBe("text/html");
			// Verify that the file was read
			expect(mockRuntime.readFile).toHaveBeenCalled();
		});

		it("should handle subdirectory paths correctly", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			// Test with subdirectory path
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](test/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 404\ncontent-type: text/html");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(404);
			expect(result.contentType).toBe("text/html");
		});

		it("should handle normalized paths correctly", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			// Test with already normalized path
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 301\ncontent-type: text/html");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(301);
			expect(result.contentType).toBe("text/html");
		});

		it("should return default values when network log file does not exist", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(false);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBeNull();
			expect(result.contentType).toBe("text/html");
		});

		it("should return default values when network command fails (line 84-85)", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command - fails
					return Promise.resolve({
						success: false,
						stdout: "",
						stderr: "Network command failed",
						exitCode: 1,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			// Should still fetch content even if status code retrieval fails
			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>Content</html>");
		});

		it("should return default values when network log path is not found (line 88)", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command - success but no log path in output
					return Promise.resolve({
						success: true,
						stdout: "Network logs available but no path",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			expect(result).not.toBeNull();
		});

		it("should return default values when log file does not exist (line 92)", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command - with log path
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/nonexistent.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockExistsSync.mockReturnValue(false);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			expect(result).not.toBeNull();
		});

		it("should return default values when log file has no status code match (line 95-96)", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command - with log path
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("log content without status code");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			expect(result).not.toBeNull();
		});

		it("should handle exceptions in getHttpMetadata gracefully (line 130)", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command - throws error
					return Promise.reject(new Error("Unexpected error"));
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Content</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			// Should handle error gracefully and continue
			expect(result).not.toBeNull();
		});

		it("should skip pages with 404 status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				return Promise.resolve({
					success: true,
					stdout: "",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 404");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/notfound");

			// Should return null for non-200 status codes
			expect(result).toBeNull();
		});

		it("should skip pages with 500 status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				return Promise.resolve({
					success: true,
					stdout: "",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 500");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/error");

			expect(result).toBeNull();
		});

		it("should accept 201 Created status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Created</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 201\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/created");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>Created</html>");
		});

		it("should accept 203 Non-Authoritative Information status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Non-Auth</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 203\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/proxy");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>Non-Auth</html>");
		});

		it("should accept 204 No Content status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html></html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 204\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/nocontent");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html></html>");
		});

		it("should accept 206 Partial Content status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Partial</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 206\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/partial");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>Partial</html>");
		});

		it("should accept 299 (maximum 2xx) status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				// eval command
				return Promise.resolve({
					success: true,
					stdout: '### Result\n"<html>Max 2xx</html>"\n### Ran Playwright code',
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 299\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/max");

			expect(result).not.toBeNull();
			expect(result?.html).toBe("<html>Max 2xx</html>");
		});

		it("should skip pages with 300 Multiple Choices status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				return Promise.resolve({
					success: true,
					stdout: "",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 300\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/redirect");

			expect(result).toBeNull();
		});

		it("should skip pages with 199 (below 2xx range) status code", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			let callCount = 0;
			mockRuntime.spawn = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// checkPlaywrightCli
					return Promise.resolve({
						success: true,
						stdout: "1.0.0",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 2) {
					// open command
					return Promise.resolve({
						success: true,
						stdout: "",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				if (callCount === 3) {
					// network command
					return Promise.resolve({
						success: true,
						stdout: "[Network](.playwright-cli/network.log)",
						stderr: "",
						exitCode: 0,
					} as SpawnResult);
				}
				return Promise.resolve({
					success: true,
					stdout: "",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);
			});
			mockRuntime.sleep = vi.fn().mockResolvedValue(undefined);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 199\ncontent-type: text/html");
			mockExistsSync.mockReturnValue(true);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com/invalid");

			expect(result).toBeNull();
		});

		it("should skip pages with ERR_HTTP_RESPONSE_CODE_FAILURE", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					stdout: "1.0.0",
					stderr: "",
					exitCode: 0,
				} as SpawnResult)
				.mockResolvedValueOnce({
					success: false,
					stdout: "",
					stderr: "ERR_HTTP_RESPONSE_CODE_FAILURE",
					exitCode: 1,
				} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			expect(result).toBeNull();
		});

		it("should skip pages redirected to chrome-error://", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					stdout: "1.0.0",
					stderr: "",
					exitCode: 0,
				} as SpawnResult)
				.mockResolvedValueOnce({
					success: true,
					stdout: "Page URL: chrome-error://chromewebdata/",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await fetcher.fetch("https://example.com");

			expect(result).toBeNull();
		});

		it("should extract application/json content-type", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi
				.fn()
				.mockResolvedValue("status: 200\ncontent-type: application/json");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(200);
			expect(result.contentType).toBe("application/json");
		});

		it("should extract application/yaml content-type", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi
				.fn()
				.mockResolvedValue("status: 200\ncontent-type: application/yaml");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(200);
			expect(result.contentType).toBe("application/yaml");
		});

		it("should handle content-type with charset parameter", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi
				.fn()
				.mockResolvedValue("status: 200\ncontent-type: text/html; charset=utf-8");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(200);
			expect(result.contentType).toBe("text/html");
		});

		it("should handle case-insensitive content-type header", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi
				.fn()
				.mockResolvedValue("status: 200\nContent-Type: application/json");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(200);
			expect(result.contentType).toBe("application/json");
		});

		it("should default to text/html when content-type is missing", async () => {
			const config = createMockConfig();
			const mockRuntime = createMockRuntime();

			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "[Network](.playwright-cli/logs/network.log)",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);

			mockExistsSync.mockReturnValue(true);
			mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200");

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			const result = await (
				fetcher as unknown as {
					getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
				}
			).getHttpMetadata();

			expect(result.statusCode).toBe(200);
			expect(result.contentType).toBe("text/html");
		});

		describe("path traversal prevention", () => {
			it("should reject path traversal attempts with ../../", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();

				// Malicious path trying to escape cwd
				mockRuntime.spawn = vi.fn().mockResolvedValue({
					success: true,
					stdout: "[Network](../../etc/passwd)",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

				mockExistsSync.mockReturnValue(true);
				mockRuntime.readFile = vi.fn().mockResolvedValue("root:x:0:0:root:/root:/bin/bash");

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
					}
				).getHttpMetadata();

				// Should return default values and NOT read the file
				expect(result.statusCode).toBeNull();
				expect(result.contentType).toBe("text/html");
				expect(mockRuntime.readFile).not.toHaveBeenCalled();
			});

			it("should reject absolute paths outside cwd", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();

				// Absolute path outside cwd
				mockRuntime.spawn = vi.fn().mockResolvedValue({
					success: true,
					stdout: "[Network](/etc/passwd)",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

				mockExistsSync.mockReturnValue(true);
				mockRuntime.readFile = vi.fn().mockResolvedValue("root:x:0:0:root:/root:/bin/bash");

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
					}
				).getHttpMetadata();

				// Should return default values and NOT read the file
				expect(result.statusCode).toBeNull();
				expect(result.contentType).toBe("text/html");
				expect(mockRuntime.readFile).not.toHaveBeenCalled();
			});

			it("should accept paths within cwd subdirectory", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();

				// Safe path within cwd
				mockRuntime.spawn = vi.fn().mockResolvedValue({
					success: true,
					stdout: "[Network](.playwright-cli/logs/network.log)",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

				mockExistsSync.mockReturnValue(true);
				mockRuntime.readFile = vi.fn().mockResolvedValue("status: 200\ncontent-type: text/html");

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
					}
				).getHttpMetadata();

				// Should successfully read the file
				expect(result.statusCode).toBe(200);
				expect(result.contentType).toBe("text/html");
				expect(mockRuntime.readFile).toHaveBeenCalled();
			});

			it("should accept simple relative paths within cwd", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();

				// Safe relative path
				mockRuntime.spawn = vi.fn().mockResolvedValue({
					success: true,
					stdout: "[Network](logs/network.log)",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

				mockExistsSync.mockReturnValue(true);
				mockRuntime.readFile = vi.fn().mockResolvedValue("status: 404\ncontent-type: text/plain");

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
					}
				).getHttpMetadata();

				// Should successfully read the file
				expect(result.statusCode).toBe(404);
				expect(result.contentType).toBe("text/plain");
				expect(mockRuntime.readFile).toHaveBeenCalled();
			});

			it("should reject path with single parent directory that escapes cwd", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();

				// Path that goes one level up from cwd
				mockRuntime.spawn = vi.fn().mockResolvedValue({
					success: true,
					stdout: "[Network](../outside.log)",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

				mockExistsSync.mockReturnValue(true);
				mockRuntime.readFile = vi.fn().mockResolvedValue("malicious content");

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
					}
				).getHttpMetadata();

				// Should return default values and NOT read the file
				expect(result.statusCode).toBeNull();
				expect(result.contentType).toBe("text/html");
				expect(mockRuntime.readFile).not.toHaveBeenCalled();
			});

			it("should handle complex traversal patterns", async () => {
				const config = createMockConfig();
				const mockRuntime = createMockRuntime();

				// Complex path with mixed .. and subdirectories
				mockRuntime.spawn = vi.fn().mockResolvedValue({
					success: true,
					stdout: "[Network](subdir/../../etc/shadow)",
					stderr: "",
					exitCode: 0,
				} as SpawnResult);

				mockExistsSync.mockReturnValue(true);
				mockRuntime.readFile = vi.fn().mockResolvedValue("sensitive data");

				const fetcher = new PlaywrightFetcher(config, mockRuntime);
				const result = await (
					fetcher as unknown as {
						getHttpMetadata(): Promise<{ statusCode: number | null; contentType: string }>;
					}
				).getHttpMetadata();

				// Should return default values and NOT read the file
				expect(result.statusCode).toBeNull();
				expect(result.contentType).toBe("text/html");
				expect(mockRuntime.readFile).not.toHaveBeenCalled();
			});
		});
	});

	describe("close - additional error scenarios", () => {
		it("should handle existsSync throwing error gracefully (line 138)", async () => {
			const config = createMockConfig({ keepSession: false });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockResolvedValue({
				success: true,
				stdout: "",
				stderr: "",
				exitCode: 0,
			} as SpawnResult);
			mockExistsSync.mockImplementation(() => {
				throw new Error("Permission denied");
			});

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			// Should not throw even if existsSync throws
			await expect(fetcher.close()).resolves.toBeUndefined();
		});

		it("should continue cleanup after session close throws (line 130-138)", async () => {
			const config = createMockConfig({ keepSession: false });
			const mockRuntime = createMockRuntime();
			mockRuntime.spawn = vi.fn().mockRejectedValue(new Error("Session close failed"));
			mockExistsSync.mockReturnValue(true);
			mockRmSync.mockReturnValue(undefined);

			const fetcher = new PlaywrightFetcher(config, mockRuntime);
			await fetcher.close();

			// Cleanup should still be attempted
			expect(mockExistsSync).toHaveBeenCalled();
			expect(mockRmSync).toHaveBeenCalled();
		});
	});
});

describe("parseCliOutput", () => {
	it("should extract HTML from CLI output", () => {
		const output = '### Result\n"<html><body>Test</body></html>"\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe("<html><body>Test</body></html>");
	});

	it("should parse JSON escaped content", () => {
		const output = '### Result\n"<html>Line 1\\nLine 2</html>"\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe("<html>Line 1\nLine 2</html>");
	});

	it("should handle quotes in content", () => {
		const output = '### Result\n"<html>He said \\"hello\\"</html>"\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe('<html>He said "hello"</html>');
	});

	it("should handle backslashes in content", () => {
		const output = '### Result\n"<html>Path: C:\\\\Users\\\\test</html>"\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe("<html>Path: C:\\Users\\test</html>");
	});

	it("should use manual escape handling when JSON.parse fails", () => {
		const output = '### Result\n"<html>Invalid JSON \\x here</html>"\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe("<html>Invalid JSON \\x here</html>");
	});

	it("should return original output when no result pattern matches", () => {
		const output = "Some random output without result pattern";
		const result = parseCliOutput(output);
		expect(result).toBe(output);
	});

	it("should handle empty HTML content", () => {
		const output = '### Result\n""\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe("");
	});

	it("should handle multiline HTML content", () => {
		const output =
			'### Result\n"<html>\\n  <body>\\n    <h1>Title</h1>\\n  </body>\\n</html>"\n### Ran Playwright code';
		const result = parseCliOutput(output);
		expect(result).toBe("<html>\n  <body>\n    <h1>Title</h1>\n  </body>\n</html>");
	});
});
