import { describe, expect, it } from "vitest";
import { stripQueryParams } from "../../src/utils/url.js";

describe("stripQueryParams", () => {
	it("strips query parameters from a URL", () => {
		expect(stripQueryParams("https://example.com/page?ref=abc")).toBe("https://example.com/page");
	});

	it("strips multiple query parameters", () => {
		expect(stripQueryParams("https://example.com/page?a=1&b=2&c=3")).toBe(
			"https://example.com/page",
		);
	});

	it("returns URL unchanged when no query params", () => {
		expect(stripQueryParams("https://example.com/page")).toBe("https://example.com/page");
	});

	it("handles empty query string", () => {
		const result = stripQueryParams("https://example.com/page?");
		expect(result).toBe("https://example.com/page");
	});

	it("preserves fragment", () => {
		expect(stripQueryParams("https://example.com/page?q=1#section")).toBe(
			"https://example.com/page#section",
		);
	});

	it("preserves path and trailing slash", () => {
		expect(stripQueryParams("https://example.com/docs/?page=2")).toBe("https://example.com/docs/");
	});

	it("returns invalid URL unchanged", () => {
		expect(stripQueryParams("not-a-url")).toBe("not-a-url");
	});

	it("handles URL with only fragment", () => {
		expect(stripQueryParams("https://example.com/page#frag")).toBe("https://example.com/page#frag");
	});
});
