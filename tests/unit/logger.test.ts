import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrawlLogger } from "../../src/crawler/logger.js";
import type { CrawlConfig } from "../../src/types.js";

describe("CrawlLogger", () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let baseConfig: CrawlConfig;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		baseConfig = {
			startUrl: "https://example.com",
			maxDepth: 2,
			maxPages: null,
			outputDir: "./output",
			sameDomain: true,
			includePattern: null,
			excludePattern: null,
			delay: 0,
			timeout: 30000,
			spaWait: 2000,
			headed: false,
			diff: false,
			pages: true,
			merge: false,
			chunks: false,
			keepSession: false,
			respectRobots: true,
			version: "2.0.0",
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("logStart", () => {
		it("should log start message with URL", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("🕷️  Link Crawler v2.0.0"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("https://example.com"));
		});

		it("should log maxDepth configuration", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Depth: 2"));
		});

		it("should log output directory", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Output: ./output"));
		});

		it("should log same domain setting", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Same domain only: true"));
		});

		it("should log diff mode setting", () => {
			const configWithDiff = { ...baseConfig, diff: true };
			const logger = new CrawlLogger(configWithDiff);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Diff mode: true"));
		});

		it("should log pages setting", () => {
			const configWithoutPages = { ...baseConfig, pages: false };
			const logger = new CrawlLogger(configWithoutPages);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Pages: no"));
		});

		it("should log merge setting", () => {
			const configWithMerge = { ...baseConfig, merge: true };
			const logger = new CrawlLogger(configWithMerge);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Merge: yes"));
		});

		it("should log chunks setting", () => {
			const configWithChunks = { ...baseConfig, chunks: true };
			const logger = new CrawlLogger(configWithChunks);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Chunks: yes"));
		});

		it("should log respectRobots as respect when true", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Robots.txt: respect"));
		});

		it("should log respectRobots as ignore when false", () => {
			const configNoRobots = { ...baseConfig, respectRobots: false };
			const logger = new CrawlLogger(configNoRobots);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Robots.txt: ignore"));
		});
	});

	describe("logSkipped", () => {
		it("should log skipped message with indent based on depth", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logSkipped(0);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("⏭️  Skipped (unchanged)"));
		});

		it("should use correct indentation for depth 1", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logSkipped(1);

			expect(consoleLogSpy).toHaveBeenCalledWith("    ⏭️  Skipped (unchanged)");
		});

		it("should use correct indentation for depth 2", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logSkipped(2);

			expect(consoleLogSpy).toHaveBeenCalledWith("      ⏭️  Skipped (unchanged)");
		});
	});

	describe("logComplete", () => {
		it("should log completion message with total pages", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logComplete(5, 2, "./output/index.json");

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅ Crawl complete!"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Pages: 5"));
		});

		it("should log specs count", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logComplete(5, 3, "./output/index.json");

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Specs: 3"));
		});

		it("should log index path", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logComplete(5, 0, "./output/index.json");

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("Index: ./output/index.json"),
			);
		});

		it("should display skipped count when in diff mode and has skips", () => {
			const configWithDiff = { ...baseConfig, diff: true };
			const logger = new CrawlLogger(configWithDiff);

			// Simulate some skipped pages
			logger.logSkipped(0);
			logger.logSkipped(0);
			logger.logComplete(5, 0, "./output/index.json");

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Skipped (unchanged): 2"));
		});

		it("should not display skipped count when not in diff mode", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logSkipped(0);
			logger.logComplete(5, 0, "./output/index.json");

			const skippedCalls = consoleLogSpy.mock.calls.filter(
				(call: unknown[]) => typeof call[0] === "string" && call[0].includes("Skipped"),
			);
			expect(skippedCalls).toHaveLength(1); // Only from logSkipped, not logComplete
		});

		it("should not display skipped count when in diff mode but no skips", () => {
			const configWithDiff = { ...baseConfig, diff: true };
			const logger = new CrawlLogger(configWithDiff);
			logger.logComplete(5, 0, "./output/index.json");

			expect(consoleLogSpy).not.toHaveBeenCalledWith(
				expect.stringContaining("Skipped (unchanged)"),
			);
		});
	});

	describe("other log methods", () => {
		it("should log loaded hashes when count > 0", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logLoadedHashes(5);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("📊 Loaded 5 existing page hashes"),
			);
		});

		it("should not log loaded hashes when count is 0", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logLoadedHashes(0);

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		it("should log index format error", () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const logger = new CrawlLogger(baseConfig);
			logger.logIndexFormatError("/path/to/index.json");

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				"[WARN] Invalid index.json format at /path/to/index.json",
			);
			consoleWarnSpy.mockRestore();
		});

		it("should log index load error with message", () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const logger = new CrawlLogger(baseConfig);
			logger.logIndexLoadError("File not found");

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				"[WARN] Failed to load index.json: File not found",
			);
			consoleWarnSpy.mockRestore();
		});

		it("should log crawl start with correct indentation", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logCrawlStart("https://example.com/page", 1);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("→ [1] https://example.com/page"),
			);
		});

		it("should log page saved", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logPageSaved("page-001.md", 0, 5);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("✓ Saved: page-001.md (5 links found)"),
			);
		});

		it("should log cached page", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logPageSaved("page-001.md", 0, 5, true);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("✓ Cached: page-001.md (5 links found)"),
			);
		});

		it("should log spec detected", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logSpecDetected("openapi", "openapi.yaml");

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("📋 Spec: openapi - openapi.yaml"),
			);
		});

		it("should log fetch error", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logFetchError("https://example.com", "Network error", 0);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("✗ Fetch Error: Network error"),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("https://example.com"));
		});

		it("should log post processing start", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logPostProcessingStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("🔄 Running Post-processing..."),
			);
		});

		it("should log post processing skipped", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logPostProcessingSkipped();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("⚠️  No pages to process"));
		});

		it("should log merger start", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logMergerStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("🔄 Running Merger..."));
		});

		it("should log merger complete", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logMergerComplete("./output/full.md");

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("✓ full.md: ./output/full.md"),
			);
		});

		it("should log chunker start", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logChunkerStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("🔄 Running Chunker..."));
		});

		it("should log chunker complete with files", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logChunkerComplete(5);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("✓ chunks: 5 files in chunks/"),
			);
		});

		it("should log chunker complete with no files", () => {
			const logger = new CrawlLogger(baseConfig);
			logger.logChunkerComplete(0);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("ℹ️  No chunks created (content too small)"),
			);
		});
	});

	describe("logWarning", () => {
		it("should log warning message via console.warn with emoji prefix", () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const logger = new CrawlLogger(baseConfig);
			logger.logWarning("All output formats are disabled.");

			expect(consoleWarnSpy).toHaveBeenCalledWith("⚠️  All output formats are disabled.");
			consoleWarnSpy.mockRestore();
		});
	});

	describe("debug logging", () => {
		it("should respect debug parameter when explicitly set to true", () => {
			const logger = new CrawlLogger(baseConfig, true);
			logger.logDebug("test message");

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[DEBUG"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("test message"));
		});

		it("should not log debug messages when explicitly set to false", () => {
			const logger = new CrawlLogger(baseConfig, false);
			logger.logDebug("test message");

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		it("should default to process.env.DEBUG when debug parameter is omitted", () => {
			// Save original DEBUG value
			const originalDebug = process.env.DEBUG;

			// Test with DEBUG not set
			delete process.env.DEBUG;
			const logger1 = new CrawlLogger(baseConfig);
			logger1.logDebug("test message");
			expect(consoleLogSpy).not.toHaveBeenCalled();

			// Test with DEBUG=1
			consoleLogSpy.mockClear();
			process.env.DEBUG = "1";
			const logger2 = new CrawlLogger(baseConfig);
			logger2.logDebug("test message with DEBUG=1");
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[DEBUG"));
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("test message with DEBUG=1"),
			);

			// Restore original DEBUG value
			if (originalDebug !== undefined) {
				process.env.DEBUG = originalDebug;
			} else {
				delete process.env.DEBUG;
			}
		});

		it("should log debug message with data when provided", () => {
			const logger = new CrawlLogger(baseConfig, true);
			const testData = { key: "value", number: 42 };
			logger.logDebug("test with data", testData);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[DEBUG"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("test with data"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"key": "value"'));
		});

		it("should include debug enabled message in logStart when debug is true", () => {
			const logger = new CrawlLogger(baseConfig, true);
			logger.logStart();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Debug: enabled"));
		});

		it("should not include debug message in logStart when debug is false", () => {
			const logger = new CrawlLogger(baseConfig, false);
			logger.logStart();

			const debugCalls = consoleLogSpy.mock.calls.filter(
				(call: unknown[]) => typeof call[0] === "string" && call[0].includes("Debug: enabled"),
			);
			expect(debugCalls).toHaveLength(0);
		});
	});
});
