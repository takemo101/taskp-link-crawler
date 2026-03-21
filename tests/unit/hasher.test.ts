import { describe, expect, it } from "vitest";
import { computeHash, Hasher } from "../../src/diff/hasher.js";

describe("computeHash", () => {
	it("should return consistent hash for same content", () => {
		const content = "Hello, World!";
		const hash1 = computeHash(content);
		const hash2 = computeHash(content);

		expect(hash1).toBe(hash2);
	});

	it("should return different hashes for different content", () => {
		const hash1 = computeHash("Content A");
		const hash2 = computeHash("Content B");

		expect(hash1).not.toBe(hash2);
	});

	it("should return valid SHA256 hex string", () => {
		const hash = computeHash("test");

		// SHA256 produces 64 character hex string
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("should handle empty string", () => {
		const hash = computeHash("");

		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("should handle unicode content", () => {
		const hash1 = computeHash("日本語テスト");
		const hash2 = computeHash("日本語テスト");

		expect(hash1).toBe(hash2);
		expect(hash1).toMatch(/^[a-f0-9]{64}$/);
	});
});

describe("Hasher", () => {
	describe("constructor", () => {
		it("should initialize with empty map by default", () => {
			const hasher = new Hasher();

			expect(hasher.size).toBe(0);
		});

		it("should initialize with provided hashes", () => {
			const hashes = new Map([
				["https://example.com/page1", "abc123"],
				["https://example.com/page2", "def456"],
			]);
			const hasher = new Hasher(hashes);

			expect(hasher.size).toBe(2);
		});

		it("should create a copy of the provided map", () => {
			const hashes = new Map([["https://example.com/page1", "abc123"]]);
			const hasher = new Hasher(hashes);

			// Modify original map
			hashes.set("https://example.com/page2", "def456");

			// Hasher should not be affected
			expect(hasher.size).toBe(1);
		});
	});

	describe("isChanged", () => {
		it("should return true for new URL", () => {
			const hasher = new Hasher();

			const result = hasher.isChanged("https://example.com/new-page", "somehash");

			expect(result).toBe(true);
		});

		it("should return false for same hash", () => {
			const hashes = new Map([["https://example.com/page1", "abc123def456"]]);
			const hasher = new Hasher(hashes);

			const result = hasher.isChanged("https://example.com/page1", "abc123def456");

			expect(result).toBe(false);
		});

		it("should return true for different hash", () => {
			const hashes = new Map([["https://example.com/page1", "original-hash"]]);
			const hasher = new Hasher(hashes);

			const result = hasher.isChanged("https://example.com/page1", "modified-hash");

			expect(result).toBe(true);
		});

		it("should be case-sensitive for URL matching", () => {
			const hashes = new Map([["https://example.com/Page1", "abc123"]]);
			const hasher = new Hasher(hashes);

			// Different case = new URL = changed
			const result = hasher.isChanged("https://example.com/page1", "abc123");

			expect(result).toBe(true);
		});
	});

	describe("size", () => {
		it("should return 0 for empty hasher", () => {
			const hasher = new Hasher();
			expect(hasher.size).toBe(0);
		});

		it("should return correct count after initialization", () => {
			const hashes = new Map([
				["https://example.com/page1", "hash1"],
				["https://example.com/page2", "hash2"],
				["https://example.com/page3", "hash3"],
			]);
			const hasher = new Hasher(hashes);

			expect(hasher.size).toBe(3);
		});
	});
});
