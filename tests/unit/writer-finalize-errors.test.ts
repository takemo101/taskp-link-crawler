/**
 * writer.ts finalize() のエラーパステスト
 *
 * node:fs をモックして renameSync / rmSync の失敗をシミュレートする。
 * 既存の writer.test.ts とは別ファイルにして、モックの影響を分離する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlConfig, Logger, PageMetadata } from "../../src/types.js";

// Type definitions for fs functions
type RenameSyncFn = (oldPath: string, newPath: string) => void;
type RmSyncFn = (path: string, options?: { recursive?: boolean; force?: boolean }) => void;
type ExistsSyncFn = (path: string) => boolean;
type MkdirSyncFn = (
	path: string,
	options?: { recursive?: boolean; mode?: number },
) => string | undefined;
type ReaddirSyncFn = (path: string) => string[];

// Mutable interceptors - tests set these to inject errors
let renameSyncInterceptor: RenameSyncFn | null = null;
let rmSyncInterceptor: RmSyncFn | null = null;

// Store real implementations inside the mock factory to avoid hoisting issues
// These are initialized in the mock factory below and never null during tests
const originals = vi.hoisted(() => {
	return {
		renameSync: undefined as unknown as RenameSyncFn,
		rmSync: undefined as unknown as RmSyncFn,
		existsSync: undefined as unknown as ExistsSyncFn,
		mkdirSync: undefined as unknown as MkdirSyncFn,
		readdirSync: undefined as unknown as ReaddirSyncFn,
	};
});

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	// Capture real implementations
	originals.renameSync = actual.renameSync;
	originals.rmSync = actual.rmSync;
	originals.existsSync = actual.existsSync;
	originals.mkdirSync = actual.mkdirSync;
	originals.readdirSync = actual.readdirSync;

	return {
		...actual,
		renameSync: ((oldPath: string, newPath: string) => {
			if (renameSyncInterceptor) {
				return renameSyncInterceptor(oldPath, newPath);
			}
			return actual.renameSync(oldPath, newPath);
		}) as RenameSyncFn,
		rmSync: ((path: string, options?: { recursive?: boolean; force?: boolean }) => {
			if (rmSyncInterceptor) {
				return rmSyncInterceptor(path, options);
			}
			return actual.rmSync(path, options);
		}) as RmSyncFn,
	};
});

// Import OutputWriter after mock is set up
const { OutputWriter } = await import("../../src/output/writer.js");

const testOutputDir = "./test-finalize-errors";

const defaultConfig: CrawlConfig = {
	startUrl: "https://example.com",
	maxDepth: 2,
	maxPages: null,
	outputDir: testOutputDir,
	sameDomain: true,
	includePattern: null,
	excludePattern: null,
	delay: 500,
	timeout: 30000,
	spaWait: 2000,
	headed: false,
	diff: false,
	pages: true,
	merge: true,
	chunks: true,
	keepSession: false,
	respectRobots: true,
	version: "test-version",
};

const defaultMetadata: PageMetadata = {
	title: "Test Page",
	description: "Test description",
	keywords: null,
	author: null,
	ogTitle: null,
	ogType: null,
};

/** テスト用モックロガー */
function createMockLogger(): Logger {
	return {
		logIndexFormatError: vi.fn(),
		logIndexLoadError: vi.fn(),
		logDebug: vi.fn(),
	};
}

describe("OutputWriter finalize() error paths", () => {
	beforeEach(() => {
		renameSyncInterceptor = null;
		rmSyncInterceptor = null;
		originals.rmSync(testOutputDir, { recursive: true, force: true });
	});

	afterEach(() => {
		renameSyncInterceptor = null;
		rmSyncInterceptor = null;
		try {
			const entries = originals
				.readdirSync(".")
				.filter((e: string) => e.startsWith("test-finalize-errors"));
			for (const entry of entries) {
				originals.rmSync(entry, { recursive: true, force: true });
			}
		} catch {
			// ignore
		}
	});

	describe("recoverFromIncompleteFinalization - rename failure", () => {
		it("should continue finalize when recovery rename fails (non-Error thrown)", () => {
			const backupDir = `${testOutputDir}.bak`;
			originals.mkdirSync(backupDir, { recursive: true });

			const logger = createMockLogger();
			const writer = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer.savePage("https://example.com/page", "# Content", 0, [], defaultMetadata, "Test");
			writer.saveIndex();

			// Make renameSync fail only for recovery rename (.bak → final)
			// Throw non-Error to cover the `String(error)` branch in error handling
			renameSyncInterceptor = (oldPath: string, newPath: string) => {
				if (oldPath === backupDir && newPath === testOutputDir) {
					throw "Simulated recovery rename failure (string)"; // non-Error value
				}
				return originals.renameSync(oldPath, newPath);
			};

			// finalize should not throw (recovery failure is non-fatal)
			expect(() => writer.finalize()).not.toThrow();

			// Verify output exists (finalize completed despite recovery failure)
			expect(originals.existsSync(testOutputDir)).toBe(true);

			// Verify logger was called with recovery-related messages
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Detected incomplete previous finalization, recovering from backup",
				expect.any(Object),
			);
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to recover from backup",
				expect.any(Object),
			);
			expect(logger.logDebug).toHaveBeenCalledWith("Output finalized successfully");
		});

		it("should continue finalize when recovery rename fails (Error thrown)", () => {
			const backupDir = `${testOutputDir}.bak`;
			originals.mkdirSync(backupDir, { recursive: true });

			const logger = createMockLogger();
			const writer = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer.savePage("https://example.com/page", "# Content", 0, [], defaultMetadata, "Test");
			writer.saveIndex();

			// Throw an Error object to cover the `error.message` branch
			renameSyncInterceptor = (oldPath: string, newPath: string) => {
				if (oldPath === backupDir && newPath === testOutputDir) {
					throw new Error("Simulated recovery rename failure (Error)");
				}
				return originals.renameSync(oldPath, newPath);
			};

			expect(() => writer.finalize()).not.toThrow();
			expect(originals.existsSync(testOutputDir)).toBe(true);

			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to recover from backup",
				expect.objectContaining({
					error: "Simulated recovery rename failure (Error)",
				}),
			);
		});
	});

	describe("promoteTemp - rename failure with backup restore", () => {
		it("should restore backup and rethrow when promoteTemp fails", () => {
			// 1. Create existing output
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original",
				0,
				[],
				defaultMetadata,
				"Original",
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. Create new writer with logger
			const logger = createMockLogger();
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage("https://example.com/new", "# New", 0, [], defaultMetadata, "New");
			writer2.saveIndex();

			const workingDir = writer2.getWorkingOutputDir();

			// Make renameSync fail when renaming temp → final (promoteTemp)
			renameSyncInterceptor = (oldPath: string, newPath: string) => {
				if (oldPath === workingDir && newPath === testOutputDir) {
					throw new Error("Simulated promoteTemp rename failure");
				}
				return originals.renameSync(oldPath, newPath);
			};

			// finalize should throw (promoteTemp failure is fatal)
			expect(() => writer2.finalize()).toThrow("Simulated promoteTemp rename failure");

			// Backup should have been restored → finalOutputDir should exist
			expect(originals.existsSync(testOutputDir)).toBe(true);

			// Verify logger was called with restore-related messages
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to rename temp directory, restoring backup",
				expect.any(Object),
			);
			expect(logger.logDebug).toHaveBeenCalledWith("Restored backup after finalize failure");
		});

		it("should restore backup when promoteTemp fails with non-Error value", () => {
			// 1. Create existing output
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original",
				0,
				[],
				defaultMetadata,
				"Original",
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. Create new writer with logger
			const logger = createMockLogger();
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage("https://example.com/new", "# New", 0, [], defaultMetadata, "New");
			writer2.saveIndex();

			const workingDir = writer2.getWorkingOutputDir();

			// Throw non-Error to cover `String(error)` branch in promoteTemp
			renameSyncInterceptor = (oldPath: string, newPath: string) => {
				if (oldPath === workingDir && newPath === testOutputDir) {
					throw "Simulated promoteTemp failure (string)"; // non-Error value
				}
				return originals.renameSync(oldPath, newPath);
			};

			expect(() => writer2.finalize()).toThrow();

			// Verify logger logged the error with String(error) path
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to rename temp directory, restoring backup",
				expect.objectContaining({
					error: "Simulated promoteTemp failure (string)",
				}),
			);
			expect(logger.logDebug).toHaveBeenCalledWith("Restored backup after finalize failure");
		});

		it("should handle promoteTemp failure when backup restore also fails", () => {
			// 1. Create existing output
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original",
				0,
				[],
				defaultMetadata,
				"Original",
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. Create new writer with logger
			const logger = createMockLogger();
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage("https://example.com/new", "# New", 0, [], defaultMetadata, "New");
			writer2.saveIndex();

			const workingDir = writer2.getWorkingOutputDir();
			const backupDir = `${testOutputDir}.bak`;
			let backupDone = false;

			// Allow backup, fail promoteTemp and backup restore
			renameSyncInterceptor = (oldPath: string, newPath: string) => {
				// backupExistingOutput: final → .bak (allow once)
				if (newPath === backupDir && !backupDone) {
					backupDone = true;
					return originals.renameSync(oldPath, newPath);
				}

				// promoteTemp: temp → final (fail)
				if (oldPath === workingDir && newPath === testOutputDir) {
					throw new Error("Simulated promoteTemp failure");
				}

				// backup restore: .bak → final (fail)
				if (oldPath === backupDir && newPath === testOutputDir) {
					throw new Error("Simulated backup restore failure");
				}

				return originals.renameSync(oldPath, newPath);
			};

			// Should still throw the original promoteTemp error
			expect(() => writer2.finalize()).toThrow("Simulated promoteTemp failure");

			// Verify logger was called with both failure messages
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to rename temp directory, restoring backup",
				expect.any(Object),
			);
			expect(logger.logDebug).toHaveBeenCalledWith("Failed to restore backup", expect.any(Object));
		});

		it("should handle promoteTemp failure when backup restore fails with non-Error", () => {
			// 1. Create existing output
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original",
				0,
				[],
				defaultMetadata,
				"Original",
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. Create new writer with logger
			const logger = createMockLogger();
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage("https://example.com/new", "# New", 0, [], defaultMetadata, "New");
			writer2.saveIndex();

			const workingDir = writer2.getWorkingOutputDir();
			const backupDir = `${testOutputDir}.bak`;
			let backupDone = false;

			renameSyncInterceptor = (oldPath: string, newPath: string) => {
				if (newPath === backupDir && !backupDone) {
					backupDone = true;
					return originals.renameSync(oldPath, newPath);
				}
				if (oldPath === workingDir && newPath === testOutputDir) {
					throw new Error("Simulated promoteTemp failure");
				}
				// backup restore fails with non-Error to cover String(restoreError) branch
				if (oldPath === backupDir && newPath === testOutputDir) {
					throw "Simulated backup restore failure (string)"; // non-Error value
				}
				return originals.renameSync(oldPath, newPath);
			};

			expect(() => writer2.finalize()).toThrow("Simulated promoteTemp failure");

			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to restore backup",
				expect.objectContaining({
					error: "Simulated backup restore failure (string)",
				}),
			);
		});
	});

	describe("removeBackup - rmSync failure", () => {
		it("should silently handle removeBackup failure (non-fatal)", () => {
			// 1. Create existing output
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original",
				0,
				[],
				defaultMetadata,
				"Original",
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. Create new writer with logger
			const logger = createMockLogger();
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage("https://example.com/new", "# New", 0, [], defaultMetadata, "New");
			writer2.saveIndex();

			const backupDir = `${testOutputDir}.bak`;

			// Make rmSync fail for backup removal (throw non-Error to cover String(error) branch)
			rmSyncInterceptor = (path: string, options?: { recursive?: boolean; force?: boolean }) => {
				if (path === backupDir) {
					throw "Simulated rmSync failure (string)"; // non-Error value
				}
				return originals.rmSync(path, options);
			};

			// finalize should NOT throw (removeBackup failure is non-fatal)
			expect(() => writer2.finalize()).not.toThrow();

			// Output should still be finalized
			expect(originals.existsSync(testOutputDir)).toBe(true);

			// Verify logger was called with non-fatal error message
			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to remove backup (non-fatal)",
				expect.any(Object),
			);
		});

		it("should silently handle removeBackup failure with Error object", () => {
			// 1. Create existing output
			const writer1 = new OutputWriter({ ...defaultConfig, diff: false });
			writer1.savePage(
				"https://example.com/original",
				"# Original",
				0,
				[],
				defaultMetadata,
				"Original",
			);
			writer1.saveIndex();
			writer1.finalize();

			// 2. Create new writer with logger
			const logger = createMockLogger();
			const writer2 = new OutputWriter({ ...defaultConfig, diff: false }, logger);
			writer2.savePage("https://example.com/new", "# New", 0, [], defaultMetadata, "New");
			writer2.saveIndex();

			const backupDir = `${testOutputDir}.bak`;

			// Throw Error object to cover `error.message` branch in removeBackup
			rmSyncInterceptor = (path: string, options?: { recursive?: boolean; force?: boolean }) => {
				if (path === backupDir) {
					throw new Error("Simulated rmSync failure (Error)");
				}
				return originals.rmSync(path, options);
			};

			expect(() => writer2.finalize()).not.toThrow();
			expect(originals.existsSync(testOutputDir)).toBe(true);

			expect(logger.logDebug).toHaveBeenCalledWith(
				"Failed to remove backup (non-fatal)",
				expect.objectContaining({
					error: "Simulated rmSync failure (Error)",
				}),
			);
		});
	});
});
