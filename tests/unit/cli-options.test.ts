/**
 * Commander.js integration tests
 *
 * These tests verify that Commander's option parsing works correctly
 * and produces the expected options object for parseConfig().
 *
 * IMPORTANT: When upgrading commander, run these tests first to detect
 * breaking changes in option parsing behavior (especially --no- prefixes).
 *
 * Background:
 * - Issue #699: --no-robots default value bug was not caught because there
 *   was no test covering Commander's option parsing
 * - Issue #703: This test file fills that gap
 */

import { Command } from "commander";
import { describe, expect, it } from "vitest";

/**
 * Parse CLI arguments using Commander with the same option definitions as crawl.ts
 *
 * @param args - Array of command-line arguments (without 'node crawl')
 * @returns Parsed options object
 */
function parseCliArgs(args: string[]): Record<string, unknown> {
	const program = new Command();
	program
		.name("crawl")
		.exitOverride() // Prevent process.exit() in tests
		.argument("<url>", "Starting URL to crawl")
		.option("-d, --depth <num>", "Maximum crawl depth", "1")
		.option("--max-pages <num>", "Maximum number of pages to crawl (0 = unlimited)")
		.option("-o, --output <dir>", "Output directory (default: ./.context/<site-name>/)")
		.option("--same-domain", "Only follow same-domain links", true)
		.option("--no-same-domain", "Follow cross-domain links")
		.option("--include <pattern>", "Include URL pattern (regex)")
		.option("--exclude <pattern>", "Exclude URL pattern (regex)")
		.option("--delay <ms>", "Delay between requests in ms", "500")
		.option("--timeout <sec>", "Request timeout in seconds", "30")
		.option("--wait <ms>", "Wait time for page rendering in ms", "2000")
		.option("--headed", "Show browser window", false)
		.option("--diff", "Incremental crawl (update only changed pages)", false)
		.option("--no-pages", "Skip individual page output")
		.option("--no-merge", "Skip merged output file")
		.option("--chunks", "Enable chunked output files", false)
		.option("--keep-session", "Keep .playwright-cli directory after crawl (for debugging)", false)
		.option("--no-robots", "Ignore robots.txt (not recommended)")
		.parse(args, { from: "user" });

	return program.opts();
}

describe("CLI option parsing: --no-robots (Issue #699)", () => {
	it("robots defaults to true (respects robots.txt)", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.robots).toBe(true);
	});

	it("--no-robots sets robots to false", () => {
		const opts = parseCliArgs(["https://example.com", "--no-robots"]);
		expect(opts.robots).toBe(false);
	});
});

describe("CLI option parsing: --no-pages", () => {
	it("pages defaults to true", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.pages).toBe(true);
	});

	it("--no-pages sets pages to false", () => {
		const opts = parseCliArgs(["https://example.com", "--no-pages"]);
		expect(opts.pages).toBe(false);
	});
});

describe("CLI option parsing: --no-merge", () => {
	it("merge defaults to true", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.merge).toBe(true);
	});

	it("--no-merge sets merge to false", () => {
		const opts = parseCliArgs(["https://example.com", "--no-merge"]);
		expect(opts.merge).toBe(false);
	});
});

describe("CLI option parsing: --same-domain / --no-same-domain", () => {
	it("sameDomain defaults to true", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.sameDomain).toBe(true);
	});

	it("--no-same-domain sets sameDomain to false", () => {
		const opts = parseCliArgs(["https://example.com", "--no-same-domain"]);
		expect(opts.sameDomain).toBe(false);
	});

	it("--same-domain explicitly sets sameDomain to true", () => {
		const opts = parseCliArgs(["https://example.com", "--same-domain"]);
		expect(opts.sameDomain).toBe(true);
	});
});

describe("CLI option parsing: numeric options", () => {
	it("depth parses string (Commander keeps string for default values)", () => {
		const opts = parseCliArgs(["https://example.com", "--depth", "5"]);
		expect(opts.depth).toBe("5");
	});

	it("depth uses default value '1'", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.depth).toBe("1");
	});

	it("delay parses string", () => {
		const opts = parseCliArgs(["https://example.com", "--delay", "1000"]);
		expect(opts.delay).toBe("1000");
	});

	it("delay uses default value '500'", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.delay).toBe("500");
	});

	it("timeout parses string", () => {
		const opts = parseCliArgs(["https://example.com", "--timeout", "60"]);
		expect(opts.timeout).toBe("60");
	});

	it("timeout uses default value '30'", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.timeout).toBe("30");
	});

	it("wait parses string", () => {
		const opts = parseCliArgs(["https://example.com", "--wait", "3000"]);
		expect(opts.wait).toBe("3000");
	});

	it("wait uses default value '2000'", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.wait).toBe("2000");
	});

	it("maxPages parses string", () => {
		const opts = parseCliArgs(["https://example.com", "--max-pages", "100"]);
		expect(opts.maxPages).toBe("100");
	});

	it("maxPages is undefined when not specified", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.maxPages).toBeUndefined();
	});
});

describe("CLI option parsing: short options", () => {
	it("-d works as --depth", () => {
		const opts = parseCliArgs(["https://example.com", "-d", "3"]);
		expect(opts.depth).toBe("3");
	});

	it("-o works as --output", () => {
		const opts = parseCliArgs(["https://example.com", "-o", "./custom"]);
		expect(opts.output).toBe("./custom");
	});
});

describe("CLI option parsing: boolean flags", () => {
	it("--headed defaults to false", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.headed).toBe(false);
	});

	it("--headed sets headed to true", () => {
		const opts = parseCliArgs(["https://example.com", "--headed"]);
		expect(opts.headed).toBe(true);
	});

	it("--diff defaults to false", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.diff).toBe(false);
	});

	it("--diff sets diff to true", () => {
		const opts = parseCliArgs(["https://example.com", "--diff"]);
		expect(opts.diff).toBe(true);
	});

	it("--chunks defaults to false", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.chunks).toBe(false);
	});

	it("--chunks sets chunks to true", () => {
		const opts = parseCliArgs(["https://example.com", "--chunks"]);
		expect(opts.chunks).toBe(true);
	});

	it("--keep-session defaults to false", () => {
		const opts = parseCliArgs(["https://example.com"]);
		expect(opts.keepSession).toBe(false);
	});

	it("--keep-session sets keepSession to true", () => {
		const opts = parseCliArgs(["https://example.com", "--keep-session"]);
		expect(opts.keepSession).toBe(true);
	});
});

describe("CLI option parsing: string options", () => {
	it("include pattern is parsed as string", () => {
		const opts = parseCliArgs(["https://example.com", "--include", "^/docs"]);
		expect(opts.include).toBe("^/docs");
	});

	it("exclude pattern is parsed as string", () => {
		const opts = parseCliArgs(["https://example.com", "--exclude", "\\.pdf$"]);
		expect(opts.exclude).toBe("\\.pdf$");
	});

	it("output directory is parsed as string", () => {
		const opts = parseCliArgs(["https://example.com", "--output", "./my-output"]);
		expect(opts.output).toBe("./my-output");
	});
});

describe("CLI option parsing: multiple options combination", () => {
	it("handles multiple options correctly", () => {
		const opts = parseCliArgs([
			"https://example.com",
			"--depth",
			"3",
			"--no-robots",
			"--delay",
			"1000",
			"--no-pages",
		]);

		expect(opts.depth).toBe("3");
		expect(opts.robots).toBe(false);
		expect(opts.delay).toBe("1000");
		expect(opts.pages).toBe(false);
	});

	it("handles all output-related options", () => {
		const opts = parseCliArgs(["https://example.com", "--no-pages", "--no-merge", "--chunks"]);

		expect(opts.pages).toBe(false);
		expect(opts.merge).toBe(false);
		expect(opts.chunks).toBe(true);
	});

	it("handles domain and pattern options together", () => {
		const opts = parseCliArgs([
			"https://example.com",
			"--no-same-domain",
			"--include",
			"^/api",
			"--exclude",
			"\\.json$",
		]);

		expect(opts.sameDomain).toBe(false);
		expect(opts.include).toBe("^/api");
		expect(opts.exclude).toBe("\\.json$");
	});

	it("handles timing-related options together", () => {
		const opts = parseCliArgs([
			"https://example.com",
			"--delay",
			"2000",
			"--timeout",
			"60",
			"--wait",
			"5000",
		]);

		expect(opts.delay).toBe("2000");
		expect(opts.timeout).toBe("60");
		expect(opts.wait).toBe("5000");
	});
});

describe("CLI option parsing: argument parsing", () => {
	it("parses the URL argument", () => {
		const program = new Command();
		program
			.name("crawl")
			.exitOverride()
			.argument("<url>", "Starting URL to crawl")
			.parse(["https://example.com"], { from: "user" });

		expect(program.args).toEqual(["https://example.com"]);
	});

	it("parses URL with path", () => {
		const program = new Command();
		program
			.name("crawl")
			.exitOverride()
			.argument("<url>", "Starting URL to crawl")
			.parse(["https://example.com/docs"], { from: "user" });

		expect(program.args).toEqual(["https://example.com/docs"]);
	});
});

describe("CLI option parsing: edge cases", () => {
	it("handles empty string values", () => {
		const opts = parseCliArgs(["https://example.com", "--output", ""]);
		expect(opts.output).toBe("");
	});

	it("handles zero values for numeric options", () => {
		const opts = parseCliArgs([
			"https://example.com",
			"--depth",
			"0",
			"--delay",
			"0",
			"--wait",
			"0",
		]);

		expect(opts.depth).toBe("0");
		expect(opts.delay).toBe("0");
		expect(opts.wait).toBe("0");
	});

	it("handles negative values for numeric options (string format)", () => {
		const opts = parseCliArgs(["https://example.com", "--depth", "-1", "--delay", "-100"]);

		expect(opts.depth).toBe("-1");
		expect(opts.delay).toBe("-100");
	});

	it("handles conflicting --same-domain and --no-same-domain (last one wins)", () => {
		const opts1 = parseCliArgs(["https://example.com", "--same-domain", "--no-same-domain"]);
		expect(opts1.sameDomain).toBe(false);

		const opts2 = parseCliArgs(["https://example.com", "--no-same-domain", "--same-domain"]);
		expect(opts2.sameDomain).toBe(true);
	});
});
