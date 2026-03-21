import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Clean up test directories matching the given pattern in the specified directory
 */
export function cleanupTestDirectories(
	baseDir: string,
	pattern: (entry: string) => boolean,
	relativePath: string,
	logPrefix = "Cleaned up",
) {
	try {
		const entries = readdirSync(baseDir);
		for (const entry of entries) {
			if (pattern(entry)) {
				const fullPath = join(baseDir, entry);
				rmSync(fullPath, { recursive: true, force: true });
				console.log(`✓ ${logPrefix}: ${relativePath}${entry}`);
			}
		}
	} catch (error) {
		console.warn(`Warning: Failed to clean up in ${relativePath}`, error);
	}
}
