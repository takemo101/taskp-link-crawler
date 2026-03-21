import { join } from "node:path";
import { cleanupTestDirectories } from "./test-utils.js";

export default async function globalSetup() {
	const linkCrawlerDir = join(import.meta.dirname, "..");

	console.log("🧹 Cleaning up old test directories before running tests...");

	// Clean up test-output-* directories in link-crawler root
	cleanupTestDirectories(
		linkCrawlerDir,
		(entry) => entry.startsWith("test-output-"),
		"",
		"Cleaned up (pre-test)",
	);

	// Clean up .tmp-* directories in link-crawler root
	cleanupTestDirectories(
		linkCrawlerDir,
		(entry) => entry.startsWith(".tmp-"),
		"",
		"Cleaned up (pre-test)",
	);

	// Clean up .test-* directories in link-crawler root (e.g. .test-fix-shebang-tmp)
	cleanupTestDirectories(
		linkCrawlerDir,
		(entry) => entry.startsWith(".test-"),
		"",
		"Cleaned up (pre-test)",
	);

	const testsUnitDir = join(linkCrawlerDir, "tests", "unit");

	// Clean up all .test-* directories in tests/unit
	cleanupTestDirectories(
		testsUnitDir,
		(entry) => entry.startsWith(".test-"),
		"tests/unit/",
		"Cleaned up (pre-test)",
	);

	// Clean up .test-output-* directories in tests/integration
	const integrationDir = join(linkCrawlerDir, "tests", "integration");
	cleanupTestDirectories(
		integrationDir,
		(entry) => entry.startsWith(".test-output-"),
		"tests/integration/",
		"Cleaned up (pre-test)",
	);
}
