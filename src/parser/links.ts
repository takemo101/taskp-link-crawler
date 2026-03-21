import type { JSDOM } from "jsdom";
import type { CrawlConfig } from "../types.js";

/** バイナリ・非HTMLファイルの拡張子パターン */
const SKIP_EXTENSIONS =
	/\.(png|jpg|jpeg|gif|svg|ico|webp|avif|bmp|tiff|pdf|zip|tar|gz|rar|7z|bz2|xz|mp4|mp3|webm|ogg|avi|mov|woff|woff2|ttf|eot|otf|css|js|mjs|map|wasm|doc|docx|xls|xlsx|ppt|pptx)$/i;

/** URL を正規化 */
export function normalizeUrl(url: string, baseUrl: string): string | null {
	try {
		const parsed = new URL(url, baseUrl);
		parsed.hash = "";
		return parsed.href;
	} catch {
		return null;
	}
}

/** 同一ドメインかチェック */
export function isSameDomain(url: string, baseUrl: string): boolean {
	try {
		const urlHost = new URL(url).hostname;
		const baseHost = new URL(baseUrl).hostname;
		return urlHost === baseHost;
	} catch {
		return false;
	}
}

/** クロール対象かどうか判定 */
export function shouldCrawl(url: string, visited: Set<string>, config: CrawlConfig): boolean {
	if (visited.has(url)) return false;
	if (config.sameDomain && !isSameDomain(url, config.startUrl)) return false;
	if (config.includePattern && !config.includePattern.test(url)) return false;
	if (config.excludePattern?.test(url)) return false;

	// バイナリファイルを除外
	if (SKIP_EXTENSIONS.test(url)) return false;

	return true;
}

/** HTML からリンクを抽出（JSDOMインスタンスを使用） */
export function extractLinks(dom: JSDOM, visited: Set<string>, config: CrawlConfig): string[] {
	const baseUrl = dom.window.location.href;
	const links = new Set<string>();
	const anchors = dom.window.document.querySelectorAll("a[href]");

	for (const anchor of anchors) {
		const href = anchor.getAttribute("href");
		if (
			!href ||
			href.startsWith("#") ||
			href.startsWith("javascript:") ||
			href.startsWith("mailto:") ||
			href.startsWith("tel:") ||
			href.startsWith("data:") ||
			href.startsWith("blob:") ||
			href.startsWith("ftp:") ||
			href.startsWith("file:")
		) {
			continue;
		}

		const normalized = normalizeUrl(href, baseUrl);
		if (normalized && shouldCrawl(normalized, visited, config)) {
			links.add(normalized);
		}
	}

	return Array.from(links);
}
