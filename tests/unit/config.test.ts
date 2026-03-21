import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/config.js";
import { ConfigError } from "../../src/errors.js";

describe("parseConfig", () => {
	it("should parse config with default values", () => {
		const { config } = parseConfig({}, "https://example.com", "test-version");

		expect(config.startUrl).toBe("https://example.com");
		expect(config.maxDepth).toBe(1);
		expect(config.outputDir).toBe("./.context/example");
		expect(config.sameDomain).toBe(true);
		expect(config.delay).toBe(500);
		expect(config.timeout).toBe(30000);
		expect(config.spaWait).toBe(2000);
		expect(config.headed).toBe(false);
		expect(config.diff).toBe(false);
		expect(config.pages).toBe(true);
		expect(config.merge).toBe(true);
		expect(config.chunks).toBe(false);
		expect(config.keepSession).toBe(false);
	});

	it("should parse config with custom options", () => {
		const { config } = parseConfig(
			{
				depth: 3,
				output: "./output",
				sameDomain: true,
				delay: 1000,
				timeout: 60,
			},
			"https://example.com",
			"test-version",
		);

		expect(config.maxDepth).toBe(3);
		expect(config.outputDir).toBe("./output");
		expect(config.delay).toBe(1000);
		expect(config.timeout).toBe(60000);
	});

	it("should cap maxDepth at 10", () => {
		const { config } = parseConfig({ depth: 100 }, "https://example.com", "test-version");

		expect(config.maxDepth).toBe(10);
	});

	it("should handle depth 0 correctly", () => {
		const { config } = parseConfig({ depth: 0 }, "https://example.com", "test-version");

		expect(config.maxDepth).toBe(0);
	});

	it("should handle depth as string '0' correctly", () => {
		const { config } = parseConfig({ depth: "0" }, "https://example.com", "test-version");

		expect(config.maxDepth).toBe(0);
	});

	it("should handle delay 0 correctly", () => {
		const { config } = parseConfig({ delay: 0 }, "https://example.com", "test-version");

		expect(config.delay).toBe(0);
	});

	it("should handle delay as string '0' correctly", () => {
		const { config } = parseConfig({ delay: "0" }, "https://example.com", "test-version");

		expect(config.delay).toBe(0);
	});

	it("should handle timeout 0 correctly", () => {
		const { config } = parseConfig({ timeout: 0 }, "https://example.com", "test-version");

		expect(config.timeout).toBe(1000); // Minimum timeout is 1 second
	});

	it("should handle timeout as string '0' correctly", () => {
		const { config } = parseConfig({ timeout: "0" }, "https://example.com", "test-version");

		expect(config.timeout).toBe(1000); // Minimum timeout is 1 second
	});

	it("should handle spaWait 0 correctly", () => {
		const { config } = parseConfig({ wait: 0 }, "https://example.com", "test-version");

		expect(config.spaWait).toBe(0);
	});

	it("should handle spaWait as string '0' correctly", () => {
		const { config } = parseConfig({ wait: "0" }, "https://example.com", "test-version");

		expect(config.spaWait).toBe(0);
	});

	it("should parse include/exclude patterns", () => {
		const { config } = parseConfig(
			{
				include: "^/docs",
				exclude: "\\.pdf$",
			},
			"https://example.com",
			"test-version",
		);

		expect(config.includePattern).toBeInstanceOf(RegExp);
		expect(config.excludePattern).toBeInstanceOf(RegExp);
		expect(config.includePattern?.test("/docs/guide")).toBe(true);
		expect(config.excludePattern?.test("file.pdf")).toBe(true);
	});

	it("should parse keepSession option", () => {
		const { config: configWithKeep } = parseConfig(
			{ keepSession: true },
			"https://example.com",
			"test-version",
		);
		expect(configWithKeep.keepSession).toBe(true);

		const { config: configWithoutKeep } = parseConfig(
			{ keepSession: false },
			"https://example.com",
			"test-version",
		);
		expect(configWithoutKeep.keepSession).toBe(false);

		const { config: configDefault } = parseConfig({}, "https://example.com", "test-version");
		expect(configDefault.keepSession).toBe(false);
	});

	it("should generate site-specific output directory from URL", () => {
		const { config: config1 } = parseConfig({}, "https://nextjs.org/docs", "test-version");
		expect(config1.outputDir).toBe("./.context/nextjs-docs");

		const { config: config2 } = parseConfig({}, "https://docs.python.org/3/", "test-version");
		expect(config2.outputDir).toBe("./.context/python-3");

		const { config: config3 } = parseConfig({}, "https://www.example.com", "test-version");
		expect(config3.outputDir).toBe("./.context/example");
	});

	it("should allow custom output directory to override default", () => {
		const { config } = parseConfig(
			{ output: "./custom-dir" },
			"https://nextjs.org/docs",
			"test-version",
		);
		expect(config.outputDir).toBe("./custom-dir");
	});

	it("should allow legacy ./.context directory to be specified explicitly", () => {
		const { config } = parseConfig(
			{ output: "./.context" },
			"https://nextjs.org/docs",
			"test-version",
		);
		expect(config.outputDir).toBe("./.context");
	});
});

describe("parseConfig - regex pattern validation", () => {
	it("should throw ConfigError for invalid include pattern", () => {
		expect(() => {
			parseConfig({ include: "[invalid" }, "https://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({ include: "[invalid" }, "https://example.com", "test-version");
		}).toThrowError(/Invalid include pattern/);
	});

	it("should throw ConfigError for invalid exclude pattern", () => {
		expect(() => {
			parseConfig({ exclude: "(unclosed" }, "https://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({ exclude: "(unclosed" }, "https://example.com", "test-version");
		}).toThrowError(/Invalid exclude pattern/);
	});

	it("should include original regex error in message", () => {
		expect(() => {
			parseConfig({ include: "[invalid" }, "https://example.com", "test-version");
		}).toThrowError(/(?:missing terminating|Unterminated character class)/);
	});

	it("should continue to work with valid patterns after error fix", () => {
		const { config } = parseConfig(
			{
				include: "^/docs",
				exclude: "\\.pdf$",
			},
			"https://example.com",
			"test-version",
		);

		expect(config.includePattern).toBeInstanceOf(RegExp);
		expect(config.excludePattern).toBeInstanceOf(RegExp);
		expect(config.includePattern?.test("/docs/guide")).toBe(true);
		expect(config.excludePattern?.test("file.pdf")).toBe(true);
	});

	it("should set configKey in ConfigError", () => {
		try {
			parseConfig({ include: "[invalid" }, "https://example.com", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("include");
		}

		try {
			parseConfig({ exclude: "(unclosed" }, "https://example.com", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("exclude");
		}
	});
});

describe("parseConfig - output format warnings", () => {
	it("should return warnings when all output formats are disabled", () => {
		const { warnings } = parseConfig(
			{ pages: false, merge: false, chunks: false },
			"https://example.com",
			"test-version",
		);

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("All output formats are disabled");
		expect(warnings[0]).toContain("Consider adding --chunks");
	});

	it("should not return warnings when at least one output format is enabled - pages", () => {
		const { warnings } = parseConfig(
			{ pages: true, merge: false, chunks: false },
			"https://example.com",
			"test-version",
		);

		expect(warnings).toHaveLength(0);
	});

	it("should not return warnings when at least one output format is enabled - merge", () => {
		const { warnings } = parseConfig(
			{ pages: false, merge: true, chunks: false },
			"https://example.com",
			"test-version",
		);

		expect(warnings).toHaveLength(0);
	});

	it("should not return warnings when at least one output format is enabled - chunks", () => {
		const { warnings } = parseConfig(
			{ pages: false, merge: false, chunks: true },
			"https://example.com",
			"test-version",
		);

		expect(warnings).toHaveLength(0);
	});

	it("should not return warnings with default configuration", () => {
		const { warnings } = parseConfig({}, "https://example.com", "test-version");

		expect(warnings).toHaveLength(0);
	});

	it("should not call console.warn directly (no side effects)", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		parseConfig(
			{ pages: false, merge: false, chunks: false },
			"https://example.com",
			"test-version",
		);

		expect(consoleSpy).not.toHaveBeenCalled();

		consoleSpy.mockRestore();
	});
});

describe("parseConfig - URL validation", () => {
	it("should throw ConfigError for invalid URL", () => {
		expect(() => {
			parseConfig({}, "not-a-url", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "not-a-url", "test-version");
		}).toThrowError(/Invalid URL: not-a-url/);
	});

	it("should throw ConfigError for empty string URL", () => {
		expect(() => {
			parseConfig({}, "", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "", "test-version");
		}).toThrowError(/Invalid URL/);
	});

	it("should throw ConfigError for malformed URL", () => {
		expect(() => {
			parseConfig({}, "://missing-protocol", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "just some text", "test-version");
		}).toThrow(ConfigError);
	});

	it("should set configKey to 'startUrl' in ConfigError", () => {
		try {
			parseConfig({}, "invalid-url", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("startUrl");
		}
	});

	it("should accept valid URLs", () => {
		const { config: config1 } = parseConfig({}, "https://example.com", "test-version");
		expect(config1.startUrl).toBe("https://example.com");

		const { config: config2 } = parseConfig({}, "http://localhost:3000", "test-version");
		expect(config2.startUrl).toBe("http://localhost:3000");

		const { config: config3 } = parseConfig({}, "https://example.com/path/to/page", "test-version");
		expect(config3.startUrl).toBe("https://example.com/path/to/page");
	});
});

describe("parseConfig - negative value validation", () => {
	it("should clamp negative delay to 0", () => {
		const { config } = parseConfig({ delay: -100 }, "https://example.com", "test-version");
		expect(config.delay).toBe(0);
	});

	it("should clamp negative timeout to 1 second (1000ms)", () => {
		const { config } = parseConfig({ timeout: -10 }, "https://example.com", "test-version");
		expect(config.timeout).toBe(1000);
	});

	it("should clamp negative spaWait to 0", () => {
		const { config } = parseConfig({ wait: -500 }, "https://example.com", "test-version");
		expect(config.spaWait).toBe(0);
	});

	it("should clamp negative depth to 0", () => {
		const { config } = parseConfig({ depth: -5 }, "https://example.com", "test-version");
		expect(config.maxDepth).toBe(0);
	});

	it("should clamp very large negative values appropriately", () => {
		const { config } = parseConfig(
			{
				delay: -999999,
				timeout: -999999,
				wait: -999999,
				depth: -999999,
			},
			"https://example.com",
			"test-version",
		);

		expect(config.delay).toBe(0);
		expect(config.timeout).toBe(1000);
		expect(config.spaWait).toBe(0);
		expect(config.maxDepth).toBe(0);
	});
});

describe("parseConfig - boundary value validation", () => {
	it("should allow delay of exactly 0", () => {
		const { config } = parseConfig({ delay: 0 }, "https://example.com", "test-version");
		expect(config.delay).toBe(0);
	});

	it("should allow depth of exactly 0", () => {
		const { config } = parseConfig({ depth: 0 }, "https://example.com", "test-version");
		expect(config.maxDepth).toBe(0);
	});

	it("should allow spaWait of exactly 0", () => {
		const { config } = parseConfig({ wait: 0 }, "https://example.com", "test-version");
		expect(config.spaWait).toBe(0);
	});

	it("should enforce minimum timeout of 1 second (1000ms)", () => {
		const { config } = parseConfig({ timeout: 0.5 }, "https://example.com", "test-version");
		expect(config.timeout).toBe(1000);
	});

	it("should allow timeout of exactly 1 second", () => {
		const { config } = parseConfig({ timeout: 1 }, "https://example.com", "test-version");
		expect(config.timeout).toBe(1000);
	});

	it("should allow timeout greater than 1 second", () => {
		const { config } = parseConfig({ timeout: 5 }, "https://example.com", "test-version");
		expect(config.timeout).toBe(5000);
	});

	it("should allow positive values for all numeric options", () => {
		const { config } = parseConfig(
			{
				delay: 100,
				timeout: 10,
				wait: 3000,
				depth: 5,
			},
			"https://example.com",
			"test-version",
		);

		expect(config.delay).toBe(100);
		expect(config.timeout).toBe(10000);
		expect(config.spaWait).toBe(3000);
		expect(config.maxDepth).toBe(5);
	});
});

describe("parseConfig - ReDoS protection", () => {
	it("should reject patterns with nested quantifiers", () => {
		expect(() => {
			parseConfig({ include: "(a+)+" }, "https://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({ include: "(a+)+" }, "https://example.com", "test-version");
		}).toThrowError(/catastrophic backtracking/);
	});

	it("should reject various forms of nested quantifiers in include pattern", () => {
		const dangerousPatterns = ["(a+)+", "(a*)+", "(a+)*", "(a{1,10})+", "^/docs/(.*)+$"];

		for (const pattern of dangerousPatterns) {
			expect(() => {
				parseConfig({ include: pattern }, "https://example.com", "test-version");
			}).toThrowError(/catastrophic backtracking/);
		}
	});

	it("should reject nested quantifiers in exclude pattern", () => {
		expect(() => {
			parseConfig({ exclude: "(b+)+" }, "https://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({ exclude: "(b+)+" }, "https://example.com", "test-version");
		}).toThrowError(/catastrophic backtracking/);
	});

	it("should accept safe patterns without nested quantifiers", () => {
		const safePatterns = [
			"^/docs",
			"\\.pdf$",
			"^/(foo|bar)+$", // 単一の量指定子
			"^/docs/.*$",
		];

		for (const pattern of safePatterns) {
			expect(() => {
				parseConfig({ include: pattern }, "https://example.com", "test-version");
			}).not.toThrow();
		}
	});

	it("should set configKey in ConfigError for ReDoS pattern", () => {
		try {
			parseConfig({ include: "(a+)+" }, "https://example.com", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("include");
		}

		try {
			parseConfig({ exclude: "(b+)+" }, "https://example.com", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("exclude");
		}
	});
});

describe("parseConfig - pattern length limit", () => {
	it("should reject patterns longer than 200 characters", () => {
		const longPattern = "a".repeat(201);

		expect(() => {
			parseConfig({ include: longPattern }, "https://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({ include: longPattern }, "https://example.com", "test-version");
		}).toThrowError(/pattern too long/);
	});

	it("should accept patterns up to 200 characters", () => {
		const maxPattern = "a".repeat(200);

		expect(() => {
			parseConfig({ include: maxPattern }, "https://example.com", "test-version");
		}).not.toThrow();
	});

	it("should reject long exclude patterns", () => {
		const longPattern = "b".repeat(201);

		expect(() => {
			parseConfig({ exclude: longPattern }, "https://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({ exclude: longPattern }, "https://example.com", "test-version");
		}).toThrowError(/pattern too long/);
	});

	it("should set configKey in ConfigError for long pattern", () => {
		const longPattern = "a".repeat(201);

		try {
			parseConfig({ include: longPattern }, "https://example.com", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("include");
		}
	});
});

describe("parseConfig - URL scheme validation", () => {
	it("should accept https URLs", () => {
		const { config } = parseConfig({}, "https://example.com", "test-version");
		expect(config.startUrl).toBe("https://example.com");
	});

	it("should accept http URLs", () => {
		const { config } = parseConfig({}, "http://localhost:3000", "test-version");
		expect(config.startUrl).toBe("http://localhost:3000");
	});

	it("should reject file:// URLs", () => {
		expect(() => {
			parseConfig({}, "file:///etc/passwd", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "file:///etc/passwd", "test-version");
		}).toThrowError(/Unsupported protocol.*file:/);
	});

	it("should reject javascript: URLs", () => {
		expect(() => {
			parseConfig({}, "javascript:alert(1)", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "javascript:alert(1)", "test-version");
		}).toThrowError(/Unsupported protocol.*javascript:/);
	});

	it("should reject ftp:// URLs", () => {
		expect(() => {
			parseConfig({}, "ftp://example.com", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "ftp://example.com", "test-version");
		}).toThrowError(/Unsupported protocol.*ftp:/);
	});

	it("should reject data: URLs", () => {
		expect(() => {
			parseConfig({}, "data:text/html,<html></html>", "test-version");
		}).toThrow(ConfigError);

		expect(() => {
			parseConfig({}, "data:text/html,<html></html>", "test-version");
		}).toThrowError(/Unsupported protocol.*data:/);
	});

	it("should set configKey to 'startUrl' in ConfigError for unsupported protocol", () => {
		try {
			parseConfig({}, "file:///etc/passwd", "test-version");
			expect.fail("Should have thrown ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as ConfigError).configKey).toBe("startUrl");
		}
	});
});

describe("parseConfig - maxPages validation", () => {
	it("should set maxPages to null by default (unlimited)", () => {
		const { config } = parseConfig({}, "https://example.com", "test-version");
		expect(config.maxPages).toBeNull();
	});

	it("should parse positive integer maxPages", () => {
		const { config } = parseConfig({ maxPages: 100 }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(100);
	});

	it("should parse maxPages as string", () => {
		const { config } = parseConfig({ maxPages: "50" }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(50);
	});

	it("should set maxPages to null when 0 (unlimited)", () => {
		const { config } = parseConfig({ maxPages: 0 }, "https://example.com", "test-version");
		expect(config.maxPages).toBeNull();
	});

	it("should set maxPages to null when negative (unlimited)", () => {
		const { config } = parseConfig({ maxPages: -1 }, "https://example.com", "test-version");
		expect(config.maxPages).toBeNull();

		const { config: config2 } = parseConfig(
			{ maxPages: -100 },
			"https://example.com",
			"test-version",
		);
		expect(config2.maxPages).toBeNull();
	});

	it("should set maxPages to null when NaN (unlimited)", () => {
		const { config } = parseConfig({ maxPages: "abc" }, "https://example.com", "test-version");
		expect(config.maxPages).toBeNull();

		const { config: config2 } = parseConfig(
			{ maxPages: "not-a-number" },
			"https://example.com",
			"test-version",
		);
		expect(config2.maxPages).toBeNull();
	});

	it("should floor decimal maxPages values", () => {
		const { config } = parseConfig({ maxPages: 42.7 }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(42);

		const { config: config2 } = parseConfig(
			{ maxPages: 99.9 },
			"https://example.com",
			"test-version",
		);
		expect(config2.maxPages).toBe(99);
	});

	it("should cap very large maxPages at MAX_PAGES_LIMIT (10000)", () => {
		const { config } = parseConfig({ maxPages: 1000000 }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(10000);
	});

	it("should allow maxPages at exactly MAX_PAGES_LIMIT", () => {
		const { config } = parseConfig({ maxPages: 10000 }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(10000);
	});

	it("should allow maxPages below MAX_PAGES_LIMIT", () => {
		const { config } = parseConfig({ maxPages: 9999 }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(9999);
	});

	it("should cap string maxPages exceeding MAX_PAGES_LIMIT", () => {
		const { config } = parseConfig({ maxPages: "99999" }, "https://example.com", "test-version");
		expect(config.maxPages).toBe(10000);
	});
});

describe("parseConfig - respectRobots validation", () => {
	it("should set respectRobots to true by default", () => {
		const { config } = parseConfig({}, "https://example.com", "test-version");
		expect(config.respectRobots).toBe(true);
	});

	it("should set respectRobots to false when robots option is false", () => {
		const { config } = parseConfig({ robots: false }, "https://example.com", "test-version");
		expect(config.respectRobots).toBe(false);
	});

	it("should set respectRobots to true when robots option is true", () => {
		const { config } = parseConfig({ robots: true }, "https://example.com", "test-version");
		expect(config.respectRobots).toBe(true);
	});

	it("should set respectRobots to true when robots option is undefined", () => {
		const { config } = parseConfig({ robots: undefined }, "https://example.com", "test-version");
		expect(config.respectRobots).toBe(true);
	});
});

describe("parseConfig - upper bound validation", () => {
	it("should cap delay at MAX_DELAY_MS (60000ms)", () => {
		const { config } = parseConfig({ delay: 999999 }, "https://example.com", "test-version");
		expect(config.delay).toBe(60000);
	});

	it("should cap timeout at MAX_TIMEOUT_SEC (300 seconds = 300000ms)", () => {
		const { config } = parseConfig({ timeout: 999999 }, "https://example.com", "test-version");
		expect(config.timeout).toBe(300000);
	});

	it("should cap spaWait at MAX_SPA_WAIT_MS (30000ms)", () => {
		const { config } = parseConfig({ wait: 999999 }, "https://example.com", "test-version");
		expect(config.spaWait).toBe(30000);
	});

	it("should allow values below upper bounds", () => {
		const { config } = parseConfig(
			{
				delay: 1000,
				timeout: 60,
				wait: 5000,
			},
			"https://example.com",
			"test-version",
		);

		expect(config.delay).toBe(1000);
		expect(config.timeout).toBe(60000);
		expect(config.spaWait).toBe(5000);
	});

	it("should handle exact upper bound values", () => {
		const { config } = parseConfig(
			{
				delay: 60000,
				timeout: 300,
				wait: 30000,
			},
			"https://example.com",
			"test-version",
		);

		expect(config.delay).toBe(60000);
		expect(config.timeout).toBe(300000);
		expect(config.spaWait).toBe(30000);
	});

	it("should cap string values that exceed upper bounds", () => {
		const { config } = parseConfig(
			{
				delay: "999999",
				timeout: "999999",
				wait: "999999",
			},
			"https://example.com",
			"test-version",
		);

		expect(config.delay).toBe(60000);
		expect(config.timeout).toBe(300000);
		expect(config.spaWait).toBe(30000);
	});
});
