import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("fix-shebang.js", () => {
	const tmpDir = join(import.meta.dirname, "../../.test-fix-shebang-tmp");
	const distDir = join(tmpDir, "dist");
	const distFile = join(distDir, "crawl.js");
	const scriptsDir = join(tmpDir, "scripts");

	beforeEach(() => {
		mkdirSync(distDir, { recursive: true });
		mkdirSync(scriptsDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	/**
	 * Helper to create a modified fix-shebang script that works with tmpDir
	 */
	function runFixShebang(): string {
		const scriptContent = readFileSync(
			join(import.meta.dirname, "../../scripts/fix-shebang.js"),
			"utf-8",
		);

		// Replace the distPath to point to our temp directory
		const modifiedScript = scriptContent.replace(
			/const distPath = .+;/,
			`const distPath = ${JSON.stringify(distFile)};`,
		);

		const tmpScript = join(scriptsDir, "fix-shebang-test.js");
		writeFileSync(tmpScript, modifiedScript, "utf-8");

		return execSync(`node ${tmpScript}`, { encoding: "utf-8" });
	}

	it("should replace #!/usr/bin/env bun with #!/usr/bin/env node", () => {
		writeFileSync(distFile, "#!/usr/bin/env bun\n// @bun\nconsole.log('hello');");

		runFixShebang();

		const result = readFileSync(distFile, "utf-8");
		expect(result).toBe("#!/usr/bin/env node\nconsole.log('hello');");
	});

	it("should add shebang when none exists", () => {
		writeFileSync(distFile, "console.log('hello');");

		runFixShebang();

		const result = readFileSync(distFile, "utf-8");
		expect(result).toBe("#!/usr/bin/env node\nconsole.log('hello');");
	});

	it("should preserve existing #!/usr/bin/env node shebang", () => {
		writeFileSync(distFile, "#!/usr/bin/env node\nconsole.log('hello');");

		runFixShebang();

		const result = readFileSync(distFile, "utf-8");
		expect(result).toBe("#!/usr/bin/env node\nconsole.log('hello');");
	});

	it("should set executable permissions", () => {
		writeFileSync(distFile, "#!/usr/bin/env bun\nconsole.log('hello');");
		chmodSync(distFile, 0o644);

		runFixShebang();

		const stats = statSync(distFile);
		const mode = stats.mode & 0o777;
		expect(mode).toBe(0o755);
	});

	it("should remove @bun comment", () => {
		writeFileSync(distFile, "#!/usr/bin/env bun\n// @bun\nconst x = 1;");

		runFixShebang();

		const result = readFileSync(distFile, "utf-8");
		expect(result).not.toContain("// @bun");
		expect(result).toContain("const x = 1;");
	});
});
