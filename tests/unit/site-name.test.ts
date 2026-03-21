import { describe, expect, it } from "vitest";
import { generateSiteName } from "../../src/utils/site-name.js";

describe("generateSiteName", () => {
	it("should generate site name from hostname and path", () => {
		expect(generateSiteName("https://nextjs.org/docs")).toBe("nextjs-docs");
		expect(generateSiteName("https://react.dev/learn")).toBe("react-learn");
		expect(generateSiteName("https://docs.example.com/api")).toBe("example-api");
	});

	it("should remove www prefix", () => {
		expect(generateSiteName("https://www.example.com")).toBe("example");
		expect(generateSiteName("https://www.example.com/docs")).toBe("example-docs");
	});

	it("should handle URLs without path", () => {
		expect(generateSiteName("https://example.com")).toBe("example");
		expect(generateSiteName("https://github.com")).toBe("github");
	});

	it("should use only first path segment", () => {
		expect(generateSiteName("https://example.com/en/docs/guide")).toBe("example-en");
		expect(generateSiteName("https://api.example.com/v1/docs")).toBe("example-v1");
	});

	it("should replace invalid characters with hyphens", () => {
		expect(generateSiteName("https://example.com/api_v2")).toBe("example-api-v2");
		expect(generateSiteName("https://example.com/my.docs")).toBe("example-my-docs");
	});

	it("should compress consecutive hyphens", () => {
		expect(generateSiteName("https://example.com/my--docs")).toBe("example-my-docs");
		expect(generateSiteName("https://my---example.com/docs")).toBe("my-example-docs");
	});

	it("should remove leading and trailing hyphens", () => {
		expect(generateSiteName("https://example.com/-docs-")).toBe("example-docs");
	});

	it("should handle invalid URLs gracefully", () => {
		expect(generateSiteName("not-a-url")).toBe("site");
		expect(generateSiteName("")).toBe("site");
	});

	it("should handle URLs with trailing slashes", () => {
		expect(generateSiteName("https://example.com/docs/")).toBe("example-docs");
		expect(generateSiteName("https://example.com/")).toBe("example");
	});

	it("should handle subdomain-based docs sites", () => {
		expect(generateSiteName("https://docs.python.org/3/")).toBe("python-3");
		expect(generateSiteName("https://api.stripe.com/v1")).toBe("stripe-v1");
	});

	it("should handle different TLDs", () => {
		expect(generateSiteName("https://example.co.uk/docs")).toBe("example-docs");
		expect(generateSiteName("https://example.io/api")).toBe("example-api");
		expect(generateSiteName("https://example.dev/guide")).toBe("example-guide");
	});

	it("should return 'site' for edge cases", () => {
		expect(generateSiteName("https://")).toBe("site");
		expect(generateSiteName("http://localhost")).toBe("localhost");
	});
});
