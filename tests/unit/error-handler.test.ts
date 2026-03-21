/**
 * Error Handler Unit Tests
 *
 * Tests the error handling logic extracted from crawl.ts entry point.
 * This ensures that different error types are handled correctly with
 * appropriate messages and exit codes.
 */

import { describe, expect, it } from "vitest";
import { EXIT_CODES } from "../../src/constants.js";
import { handleError } from "../../src/error-handler.js";
import {
	ConfigError,
	CrawlError,
	DependencyError,
	FetchError,
	TimeoutError,
} from "../../src/errors.js";

describe("Error Handler", () => {
	describe("DependencyError handling", () => {
		it("returns correct message and exit code for DependencyError", () => {
			const error = new DependencyError("playwright-cli not found", "playwright-cli");
			const result = handleError(error);

			expect(result.message).toBe("✗ playwright-cli not found");
			expect(result.exitCode).toBe(EXIT_CODES.DEPENDENCY_ERROR);
		});

		it("handles DependencyError with different dependency names", () => {
			const error = new DependencyError("node not found", "node");
			const result = handleError(error);

			expect(result.message).toBe("✗ node not found");
			expect(result.exitCode).toBe(EXIT_CODES.DEPENDENCY_ERROR);
		});
	});

	describe("ConfigError handling", () => {
		it("returns correct message and exit code for ConfigError", () => {
			const error = new ConfigError("Invalid depth value", "depth");
			const result = handleError(error);

			expect(result.message).toBe("✗ Configuration error: Invalid depth value");
			expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGUMENTS);
		});

		it("handles ConfigError without configKey", () => {
			const error = new ConfigError("Missing required configuration");
			const result = handleError(error);

			expect(result.message).toBe("✗ Configuration error: Missing required configuration");
			expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGUMENTS);
		});
	});

	describe("FetchError handling", () => {
		it("returns correct message and exit code for FetchError", () => {
			const error = new FetchError("HTTP 404 Not Found", "https://example.com/missing");
			const result = handleError(error);

			expect(result.message).toBe(
				"✗ Fetch error at https://example.com/missing: HTTP 404 Not Found",
			);
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("handles FetchError with different URLs", () => {
			const error = new FetchError("Connection refused", "https://localhost:9999");
			const result = handleError(error);

			expect(result.message).toBe("✗ Fetch error at https://localhost:9999: Connection refused");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("handles FetchError with cause", () => {
			const cause = new Error("Network timeout");
			const error = new FetchError("Request failed", "https://example.com", cause);
			const result = handleError(error);

			expect(result.message).toBe("✗ Fetch error at https://example.com: Request failed");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});
	});

	describe("TimeoutError handling", () => {
		it("returns correct message and exit code for TimeoutError", () => {
			const error = new TimeoutError("Page load timeout", 30000);
			const result = handleError(error);

			expect(result.message).toBe("✗ Request timeout after 30000ms");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("handles TimeoutError with different timeout values", () => {
			const error = new TimeoutError("Timeout occurred", 5000);
			const result = handleError(error);

			expect(result.message).toBe("✗ Request timeout after 5000ms");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});
	});

	describe("CrawlError handling", () => {
		it("returns correct message and exit code for CrawlError", () => {
			const error = new CrawlError("Generic crawl error", "CRAWL_FAILED");
			const result = handleError(error);

			expect(result.message).toBe("✗ CrawlError[CRAWL_FAILED]: Generic crawl error");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("handles CrawlError with cause", () => {
			const cause = new Error("Underlying issue");
			const error = new CrawlError("Crawl failed", "CRAWL_FAILED", cause);
			const result = handleError(error);

			expect(result.message).toContain("CrawlError[CRAWL_FAILED]: Crawl failed");
			expect(result.message).toContain("Caused by: Underlying issue");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});
	});

	describe("Error inheritance order", () => {
		it("handles FetchError before CrawlError (FetchError extends CrawlError)", () => {
			const error = new FetchError("Network error", "https://example.com");
			const result = handleError(error);

			// Should use FetchError-specific handling, not CrawlError
			expect(result.message).toContain("Fetch error at https://example.com");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("handles TimeoutError before CrawlError (TimeoutError extends CrawlError)", () => {
			const error = new TimeoutError("Timeout", 10000);
			const result = handleError(error);

			// Should use TimeoutError-specific handling, not CrawlError
			expect(result.message).toContain("Request timeout after 10000ms");
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});
	});

	describe("Unknown error handling", () => {
		it("handles standard Error instances", () => {
			const error = new Error("Something went wrong");
			const result = handleError(error);

			expect(result.message).toBe("✗ Fatal error: Something went wrong");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});

		it("handles string errors", () => {
			const error = "String error message";
			const result = handleError(error);

			expect(result.message).toBe("✗ Fatal error: String error message");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});

		it("handles null errors", () => {
			const error = null;
			const result = handleError(error);

			expect(result.message).toBe("✗ Fatal error: null");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});

		it("handles undefined errors", () => {
			const error = undefined;
			const result = handleError(error);

			expect(result.message).toBe("✗ Fatal error: undefined");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});

		it("handles numeric errors", () => {
			const error = 42;
			const result = handleError(error);

			expect(result.message).toBe("✗ Fatal error: 42");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});

		it("handles object errors without Error interface", () => {
			const error = { code: "ERR_UNKNOWN", details: "Something failed" };
			const result = handleError(error);

			expect(result.message).toContain("✗ Fatal error:");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});

		it("handles Error with empty message", () => {
			const error = new Error("");
			const result = handleError(error);

			expect(result.message).toBe("✗ Fatal error: ");
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});
	});

	describe("Message format consistency", () => {
		it("all error messages start with ✗ symbol", () => {
			const errors = [
				new DependencyError("test", "dep"),
				new ConfigError("test"),
				new FetchError("test", "https://example.com"),
				new TimeoutError("test", 1000),
				new CrawlError("test", "CODE"),
				new Error("test"),
				"string error",
			];

			for (const error of errors) {
				const result = handleError(error);
				expect(result.message).toMatch(/^✗ /);
			}
		});
	});

	describe("Exit code correctness", () => {
		it("uses DEPENDENCY_ERROR code for dependency errors", () => {
			const error = new DependencyError("test", "dep");
			const result = handleError(error);
			expect(result.exitCode).toBe(EXIT_CODES.DEPENDENCY_ERROR);
		});

		it("uses INVALID_ARGUMENTS code for config errors", () => {
			const error = new ConfigError("test");
			const result = handleError(error);
			expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGUMENTS);
		});

		it("uses CRAWL_ERROR code for fetch errors", () => {
			const error = new FetchError("test", "url");
			const result = handleError(error);
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("uses CRAWL_ERROR code for timeout errors", () => {
			const error = new TimeoutError("test", 1000);
			const result = handleError(error);
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("uses CRAWL_ERROR code for crawl errors", () => {
			const error = new CrawlError("test", "CODE");
			const result = handleError(error);
			expect(result.exitCode).toBe(EXIT_CODES.CRAWL_ERROR);
		});

		it("uses GENERAL_ERROR code for unknown errors", () => {
			const error = new Error("test");
			const result = handleError(error);
			expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
		});
	});
});
