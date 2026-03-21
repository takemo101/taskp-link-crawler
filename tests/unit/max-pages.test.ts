import { describe, expect, test } from "vitest";
import { parseConfig } from "../../src/config.js";

describe("--max-pages option", () => {
	const baseUrl = "https://example.com";

	test("default is null (unlimited)", () => {
		const { config } = parseConfig({}, baseUrl, "test-version");
		expect(config.maxPages).toBeNull();
	});

	test("accepts positive integer", () => {
		const { config } = parseConfig({ maxPages: "100" }, baseUrl, "test-version");
		expect(config.maxPages).toBe(100);
	});

	test("treats 0 as unlimited", () => {
		const { config } = parseConfig({ maxPages: "0" }, baseUrl, "test-version");
		expect(config.maxPages).toBeNull();
	});

	test("treats negative as unlimited", () => {
		const { config } = parseConfig({ maxPages: "-10" }, baseUrl, "test-version");
		expect(config.maxPages).toBeNull();
	});

	test("floors decimal values", () => {
		const { config } = parseConfig({ maxPages: "50.7" }, baseUrl, "test-version");
		expect(config.maxPages).toBe(50);
	});

	test("treats invalid input as unlimited", () => {
		const { config } = parseConfig({ maxPages: "abc" }, baseUrl, "test-version");
		expect(config.maxPages).toBeNull();
	});

	test("accepts large numbers", () => {
		const { config } = parseConfig({ maxPages: "10000" }, baseUrl, "test-version");
		expect(config.maxPages).toBe(10000);
	});

	test("handles string '1'", () => {
		const { config } = parseConfig({ maxPages: "1" }, baseUrl, "test-version");
		expect(config.maxPages).toBe(1);
	});
});
