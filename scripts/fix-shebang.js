#!/usr/bin/env node
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "../dist/crawl.js");

const NODE_SHEBANG = "#!/usr/bin/env node";

try {
	let content = readFileSync(distPath, "utf-8");

	if (content.startsWith("#!/usr/bin/env bun")) {
		// #!/usr/bin/env bun を #!/usr/bin/env node に置換
		content = content.replace(/^#!\/usr\/bin\/env bun/, NODE_SHEBANG);
	} else if (!content.startsWith("#!")) {
		// shebang が存在しない場合は追加
		content = `${NODE_SHEBANG}\n${content}`;
	}

	// @bun コメントを削除
	content = content.replace(/^\/\/ @bun\n/m, "");

	writeFileSync(distPath, content, "utf-8");

	// 実行権限を付与
	chmodSync(distPath, 0o755);

	console.log("✅ Shebang fixed: #!/usr/bin/env node");
} catch (error) {
	console.error("❌ Failed to fix shebang:", error.message);
	process.exit(1);
}
