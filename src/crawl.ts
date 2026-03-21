#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import { parseConfig } from "./config.js";
import { EXIT_CODES } from "./constants.js";
import { Crawler } from "./crawler/index.js";
import { CrawlLogger } from "./crawler/logger.js";
import { handleError } from "./error-handler.js";
import { SignalHandler } from "./signal-handler.js";

// package.jsonからバージョンを読み込む
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

program
	.name("crawl")
	.description("Crawl technical documentation sites recursively")
	.argument("[url]", "Starting URL to crawl")
	.option("-d, --depth <num>", "Maximum crawl depth", "1")
	.option("--max-pages <num>", "Maximum number of pages to crawl (0 = unlimited)")
	.option("-o, --output <dir>", "Output directory (default: ./.context/<site-name>/)")
	.option("--same-domain", "Only follow same-domain links", true)
	.option("--no-same-domain", "Follow cross-domain links")
	.option("--include <pattern>", "Include URL pattern (regex)")
	.option("--exclude <pattern>", "Exclude URL pattern (regex)")
	.option("--delay <ms>", "Delay between requests in ms", "500")
	.option("--timeout <sec>", "Request timeout in seconds", "30")
	.option("--wait <ms>", "Wait time for page rendering in ms", "2000")
	.option("--headed", "Show browser window", false)
	.option("--diff", "Incremental crawl (update only changed pages)", false)
	.option("--no-pages", "Skip individual page output")
	.option("--no-merge", "Skip merged output file")
	.option("--chunks", "Enable chunked output files", false)
	.option("--keep-session", "Keep .playwright-cli directory after crawl (for debugging)", false)
	.option("--no-robots", "Ignore robots.txt (not recommended)")
	.version(packageJson.version)
	.parse();

const options = program.opts();
const startUrl = program.args[0];

if (!startUrl) {
	program.outputHelp();
	process.exit(EXIT_CODES.INVALID_ARGUMENTS);
}

async function main(): Promise<void> {
	let crawler: Crawler | undefined;

	// シグナルハンドラを設定
	const signalHandler = new SignalHandler({
		onShutdown: async () => {
			if (crawler) {
				await crawler.cleanup();
			}
		},
		exitCode: EXIT_CODES.GENERAL_ERROR,
	});

	signalHandler.install();

	const { config, warnings } = parseConfig(options, startUrl, packageJson.version);

	// 設定パース時の警告を CrawlLogger 経由で出力
	if (warnings.length > 0) {
		const logger = new CrawlLogger(config);
		for (const warning of warnings) {
			logger.logWarning(warning);
		}
	}

	crawler = new Crawler(config);
	await crawler.run();
}

main().catch((error) => {
	const { message, exitCode } = handleError(error);
	console.error(message);
	process.exit(exitCode);
});
