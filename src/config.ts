import { DEFAULTS } from "./constants.js";
import { ConfigError } from "./errors.js";
import type { CrawlConfig } from "./types.js";
import { generateSiteName } from "./utils/site-name.js";

/**
 * parseConfig の戻り値
 * config パース結果と、呼び出し側で表示すべき警告メッセージを含む
 */
export interface ParseConfigResult {
	config: CrawlConfig;
	warnings: string[];
}

/**
 * Parse a regex pattern string into a RegExp object
 * @param pattern - The regex pattern string
 * @param name - The name of the pattern (for error messages)
 * @returns RegExp object or null if pattern is undefined
 * @throws ConfigError if the pattern is invalid
 */
function parsePattern(pattern: string | undefined, name: string): RegExp | null {
	if (!pattern) return null;

	// パターン長の上限（過度に複雑なパターンを拒否）
	if (pattern.length > 200) {
		throw new ConfigError(`${name} pattern too long (max 200 chars)`, name);
	}

	try {
		const regex = new RegExp(String(pattern));

		// 簡易的なReDoSチェック: ネストした量指定子を拒否
		// パターン: 量指定子 + 閉じ括弧 + 量指定子
		// 例: (a+)+, (a*)+, (a+)*, (a{1,})+
		if (/(\+|\*|\{[^}]*\})\s*\)(\+|\*|\{)/.test(pattern)) {
			throw new ConfigError(`${name} pattern may cause catastrophic backtracking`, name);
		}

		return regex;
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		throw new ConfigError(`Invalid ${name} pattern: ${errorMessage}`, name);
	}
}

export function parseConfig(
	options: Record<string, unknown>,
	startUrl: string,
	version: string,
): ParseConfigResult {
	// Validate startUrl format
	let parsed: URL;
	try {
		parsed = new URL(startUrl);
	} catch {
		throw new ConfigError(`Invalid URL: ${startUrl}`, "startUrl");
	}

	// Validate URL scheme (only http/https allowed)
	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new ConfigError(
			`Unsupported protocol: ${parsed.protocol} (only http/https supported)`,
			"startUrl",
		);
	}

	// Generate site-specific output directory if not specified
	const defaultOutputDir = `${DEFAULTS.OUTPUT_DIR}/${generateSiteName(startUrl)}`;
	const outputDir = String(options.output || defaultOutputDir);

	// Parse depth value safely (handle 0 correctly)
	const depthValue = Number(options.depth);
	const maxDepth = Math.max(
		0,
		Math.min(Number.isNaN(depthValue) ? DEFAULTS.MAX_DEPTH : depthValue, DEFAULTS.MAX_DEPTH_LIMIT),
	);

	// Parse maxPages value safely (0 or negative = unlimited)
	const maxPagesValue = Number(options.maxPages);
	const maxPages =
		Number.isNaN(maxPagesValue) || maxPagesValue <= 0
			? null
			: Math.min(DEFAULTS.MAX_PAGES_LIMIT, Math.floor(maxPagesValue));

	const config: CrawlConfig = {
		startUrl,
		maxDepth,
		maxPages,
		outputDir,
		sameDomain: options.sameDomain !== false,
		includePattern: parsePattern(options.include as string | undefined, "include"),
		excludePattern: parsePattern(options.exclude as string | undefined, "exclude"),
		delay: Math.min(
			DEFAULTS.MAX_DELAY_MS,
			Math.max(0, Number.isNaN(Number(options.delay)) ? DEFAULTS.DELAY_MS : Number(options.delay)),
		),
		timeout:
			Math.min(
				DEFAULTS.MAX_TIMEOUT_SEC,
				Math.max(
					1,
					Number.isNaN(Number(options.timeout)) ? DEFAULTS.TIMEOUT_SEC : Number(options.timeout),
				),
			) * 1000,
		spaWait: Math.min(
			DEFAULTS.MAX_SPA_WAIT_MS,
			Math.max(0, Number.isNaN(Number(options.wait)) ? DEFAULTS.SPA_WAIT_MS : Number(options.wait)),
		),
		headed: Boolean(options.headed),
		diff: Boolean(options.diff),
		pages: options.pages !== false,
		merge: options.merge !== false,
		chunks: options.chunks === true,
		keepSession: Boolean(options.keepSession),
		respectRobots: options.robots !== false,
		version,
	};

	// Collect warnings (output is delegated to the caller via CrawlLogger)
	const warnings: string[] = [];
	if (!config.pages && !config.merge && !config.chunks) {
		warnings.push(
			"All output formats are disabled (--no-pages --no-merge without --chunks). Only index.json will be generated. Consider adding --chunks.",
		);
	}

	return { config, warnings };
}
