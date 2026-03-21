import { Readability } from "@mozilla/readability";
import type { JSDOM } from "jsdom";
import type { PageMetadata } from "../types.js";

/**
 * コードブロック検出用セレクタ（優先順位順）
 *
 * より具体的なセレクタを先に処理することで、
 * ネストされたコードブロックを正しく扱います。
 *
 * 新しいコードブロック形式を追加する場合は、
 * この配列に追加するだけで全機能に反映されます。
 */
const CODE_BLOCK_PRIORITY_SELECTORS = [
	"[data-rehype-pretty-code-fragment]",
	"[data-rehype-pretty-code-figure]",
	".code-block",
	".hljs",
	".prism-code",
	".shiki",
	".torchlight",
	".highlight",
	"[data-language]",
	"[data-lang]",
	"pre",
	"code",
] as const;

/** 一意なマーカーIDを生成 */
function generateMarkerId(index: number): string {
	return `CODEBLOCK_${index}`;
}

/** コードブロックを保護（マーカーに置き換え） */
function protectCodeBlocks(doc: Document): Map<string, string> {
	const codeBlockMap = new Map<string, string>();
	let index = 0;

	// Phase 1: Collect all code block elements from all selectors
	// This must be done before any DOM modifications to ensure we have accurate parent-child relationships
	const allElements: Element[] = [];
	for (const selector of CODE_BLOCK_PRIORITY_SELECTORS) {
		const elements = Array.from(doc.querySelectorAll(selector));
		allElements.push(...elements);
	}

	// Phase 2: Filter out nested elements (children of other code blocks)
	// Use a Set to track which elements we'll process to avoid duplicates
	const elementsToProcess: Element[] = [];
	const processedSet = new Set<Element>();

	for (const el of allElements) {
		// Skip if already marked for processing
		if (processedSet.has(el)) {
			continue;
		}

		// Check if this element is a child of any other element in allElements
		// Using contains() is more reliable than walking parentElement chain
		let isNested = false;
		for (const other of allElements) {
			if (other !== el && other.contains(el)) {
				isNested = true;
				break;
			}
		}

		// Only process top-level code block containers (not nested children)
		if (!isNested) {
			elementsToProcess.push(el);
			processedSet.add(el);
		}
	}

	// Phase 3: Replace filtered elements with placeholders
	// Now that we know which elements to process, we can safely modify the DOM
	for (const el of elementsToProcess) {
		const markerId = generateMarkerId(index);
		const marker = `__CODEBLOCK_${markerId}__`;
		codeBlockMap.set(marker, el.outerHTML);

		// Create placeholder element
		const placeholder = doc.createElement("span");
		placeholder.setAttribute("data-codeblock-id", markerId);
		placeholder.setAttribute("data-codeblock-placeholder", "true");
		placeholder.textContent = marker;

		// Replace original element with placeholder
		el.replaceWith(placeholder);
		index++;
	}

	return codeBlockMap;
}

/** マーカーをコードブロックに復元 */
function restoreCodeBlocks(html: string, codeBlockMap: Map<string, string>): string {
	let restored = html;
	for (const [marker, codeBlock] of codeBlockMap) {
		// プレースホルダー要素パターンを検索して置換
		const placeholderPattern = new RegExp(
			`<span[^>]*data-codeblock-placeholder="true"[^>]*>\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</span>`,
			"gi",
		);
		restored = restored.replace(placeholderPattern, codeBlock);

		// マーカー文字列だけが残っている場合も置換
		restored = restored.replace(
			new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
			codeBlock,
		);
	}
	return restored;
}

/**
 * Fallback content extraction when Readability fails
 *
 * Note: Code block preservation is handled by the caller via restoreCodeBlocks.
 * This function receives a document where code blocks have already been replaced
 * with placeholders by protectCodeBlocks.
 */
function extractFallbackContent(doc: Document): {
	title: string | null;
	content: string | null;
} {
	const body = doc.body;

	// 不要な要素を削除
	for (const el of body.querySelectorAll("script, style, noscript, nav, header, footer, aside")) {
		el.remove();
	}

	const main = doc.querySelector("main, article, [role='main'], .content, #content") || body;
	const content = main?.innerHTML || null;

	return {
		title: null,
		content,
	};
}

/** HTMLからメタデータを抽出 */
export function extractMetadata(dom: JSDOM): PageMetadata {
	const doc = dom.window.document;

	const getMeta = (name: string): string | null => {
		const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
		return el?.getAttribute("content") || null;
	};

	return {
		title: doc.querySelector("title")?.textContent?.trim() || null,
		description: getMeta("description") || getMeta("og:description"),
		keywords: getMeta("keywords"),
		author: getMeta("author"),
		ogTitle: getMeta("og:title"),
		ogType: getMeta("og:type"),
	};
}

/** HTMLから本文コンテンツを抽出（JSDOMインスタンスを使用） */
export function extractContent(dom: JSDOM): { title: string | null; content: string | null } {
	// DOM を破壊しないようにクローンを使用 (Issue #745)
	const clonedDoc = dom.window.document.cloneNode(true) as Document;

	// クローンに対してコードブロック保護を実行
	const codeBlockMap = protectCodeBlocks(clonedDoc);

	const reader = new Readability(clonedDoc);
	const article = reader.parse();

	if (article?.content) {
		// コードブロックを復元
		const restoredContent = restoreCodeBlocks(article.content, codeBlockMap);
		return { title: article.title ?? null, content: restoredContent };
	}

	// フォールバック: main タグなどから抽出
	const fallback = extractFallbackContent(clonedDoc);
	// マーカーを復元してコードブロックを正しく保持
	if (fallback.content) {
		fallback.content = restoreCodeBlocks(fallback.content, codeBlockMap);
	}
	return fallback;
}
