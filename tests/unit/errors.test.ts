import { describe, expect, it } from "vitest";
import {
	ConfigError,
	CrawlError,
	DependencyError,
	FetchError,
	TimeoutError,
} from "../../src/errors.js";

describe("CrawlError", () => {
	it("should create error with message and code", () => {
		const error = new CrawlError("Something went wrong", "TEST_ERROR");

		expect(error.message).toBe("Something went wrong");
		expect(error.code).toBe("TEST_ERROR");
		expect(error.name).toBe("CrawlError");
		expect(error.cause).toBeUndefined();
	});

	it("should create error with cause", () => {
		const cause = new Error("Original error");
		const error = new CrawlError("Wrapped error", "WRAP_ERROR", cause);

		expect(error.message).toBe("Wrapped error");
		expect(error.code).toBe("WRAP_ERROR");
		expect(error.cause).toBe(cause);
	});

	it("should format toString without cause", () => {
		const error = new CrawlError("Test message", "TEST_CODE");

		expect(error.toString()).toBe("CrawlError[TEST_CODE]: Test message");
	});

	it("should format toString with cause", () => {
		const cause = new Error("Caused by this");
		const error = new CrawlError("Test message", "TEST_CODE", cause);

		expect(error.toString()).toBe("CrawlError[TEST_CODE]: Test message\nCaused by: Caused by this");
	});

	it("should format toString with string cause", () => {
		const error = new CrawlError("Test message", "TEST_CODE", "connection reset");

		expect(error.toString()).toBe(
			"CrawlError[TEST_CODE]: Test message\nCaused by: connection reset",
		);
	});

	it("should format toString with object cause", () => {
		const cause = { code: "ECONNRESET", errno: -54 };
		const error = new CrawlError("Test message", "TEST_CODE", cause);

		expect(error.toString()).toContain("CrawlError[TEST_CODE]: Test message\nCaused by:");
		expect(error.toString()).toContain("ECONNRESET");
	});

	it("should format toString with number cause", () => {
		const error = new CrawlError("Test message", "TEST_CODE", 404);

		expect(error.toString()).toBe("CrawlError[TEST_CODE]: Test message\nCaused by: 404");
	});
});

describe("FetchError", () => {
	it("should create fetch error with url", () => {
		const error = new FetchError("Failed to fetch", "https://example.com");

		expect(error.message).toBe("Failed to fetch");
		expect(error.url).toBe("https://example.com");
		expect(error.code).toBe("FETCH_ERROR");
		expect(error.name).toBe("FetchError");
	});

	it("should create fetch error with cause", () => {
		const cause = new Error("Network error");
		const error = new FetchError("Failed to fetch", "https://example.com", cause);

		expect(error.cause).toBe(cause);
		expect(error.toString()).toContain("Network error");
	});

	it("should inherit from CrawlError", () => {
		const error = new FetchError("Test", "https://example.com");

		expect(error).toBeInstanceOf(CrawlError);
	});
});

describe("ConfigError", () => {
	it("should create config error with configKey", () => {
		const error = new ConfigError("Invalid value", "maxDepth");

		expect(error.message).toBe("Invalid value");
		expect(error.configKey).toBe("maxDepth");
		expect(error.code).toBe("CONFIG_ERROR");
		expect(error.name).toBe("ConfigError");
	});

	it("should create config error without configKey", () => {
		const error = new ConfigError("General config error");

		expect(error.message).toBe("General config error");
		expect(error.configKey).toBeUndefined();
	});

	it("should inherit from CrawlError", () => {
		const error = new ConfigError("Test");

		expect(error).toBeInstanceOf(CrawlError);
	});
});

describe("DependencyError", () => {
	it("should create dependency error", () => {
		const error = new DependencyError("playwright-cli not found", "playwright-cli");

		expect(error.message).toBe("playwright-cli not found");
		expect(error.dependency).toBe("playwright-cli");
		expect(error.code).toBe("DEPENDENCY_ERROR");
		expect(error.name).toBe("DependencyError");
	});

	it("should inherit from CrawlError", () => {
		const error = new DependencyError("Test", "dep");

		expect(error).toBeInstanceOf(CrawlError);
	});
});

describe("TimeoutError", () => {
	it("should create timeout error with timeoutMs", () => {
		const error = new TimeoutError("Request timeout", 30000);

		expect(error.message).toBe("Request timeout");
		expect(error.timeoutMs).toBe(30000);
		expect(error.code).toBe("TIMEOUT_ERROR");
		expect(error.name).toBe("TimeoutError");
	});

	it("should inherit from CrawlError", () => {
		const error = new TimeoutError("Test", 5000);

		expect(error).toBeInstanceOf(CrawlError);
	});
});
