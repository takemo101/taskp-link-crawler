import { describe, expect, it } from "vitest";
import { PATHS } from "../../src/constants.js";

describe("PATHS constants", () => {
	describe("NODE_PATHS", () => {
		it("should include macOS paths", () => {
			expect(PATHS.NODE_PATHS).toContain("/opt/homebrew/bin/node");
			expect(PATHS.NODE_PATHS).toContain("/usr/local/bin/node");
		});

		it("should include Linux path", () => {
			expect(PATHS.NODE_PATHS).toContain("/usr/bin/node");
		});

		it("should include PATH fallback", () => {
			expect(PATHS.NODE_PATHS).toContain("node");
		});

		it("should have correct order: fallback before specific paths", () => {
			const paths = PATHS.NODE_PATHS;
			const fallbackIndex = paths.indexOf("node");
			const macOSIndices = [
				paths.indexOf("/opt/homebrew/bin/node"),
				paths.indexOf("/usr/local/bin/node"),
			];
			const linuxIndex = paths.indexOf("/usr/bin/node");

			// PATH fallback should come first, before specific paths
			for (const index of [...macOSIndices, linuxIndex]) {
				expect(index).toBeGreaterThan(fallbackIndex);
			}
		});
	});

	describe("PLAYWRIGHT_PATHS", () => {
		it("should include macOS paths", () => {
			expect(PATHS.PLAYWRIGHT_PATHS).toContain("/opt/homebrew/bin/playwright-cli");
			expect(PATHS.PLAYWRIGHT_PATHS).toContain("/usr/local/bin/playwright-cli");
		});

		it("should include PATH fallback", () => {
			expect(PATHS.PLAYWRIGHT_PATHS).toContain("playwright-cli");
		});

		it("should have correct order: fallback before specific paths", () => {
			const paths = PATHS.PLAYWRIGHT_PATHS;
			const fallbackIndex = paths.indexOf("playwright-cli");
			const macOSIndices = [
				paths.indexOf("/opt/homebrew/bin/playwright-cli"),
				paths.indexOf("/usr/local/bin/playwright-cli"),
			];

			// PATH fallback should come first, before specific paths
			for (const index of macOSIndices) {
				expect(index).toBeGreaterThan(fallbackIndex);
			}
		});

		it("should include HOME-based npm global path when HOME is set", () => {
			if (process.env.HOME) {
				const expectedPath = `${process.env.HOME}/.npm-global/bin/playwright-cli`;
				expect(PATHS.PLAYWRIGHT_PATHS).toContain(expectedPath);
			}
		});

		it("should have fallback as first element", () => {
			const paths = PATHS.PLAYWRIGHT_PATHS;
			expect(paths[0]).toBe("playwright-cli");
		});
	});
});
