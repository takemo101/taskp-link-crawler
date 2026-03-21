import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

/** 言語を検出するためのクラス名パターン（優先順位順） */
const LANGUAGE_CLASS_PATTERNS = [
	/language-(\w+)/, // language-python, language-javascript, etc.
	/lang-(\w+)/, // lang-python, etc.
];

/** 要素から言語を検出 */
function detectLanguage(el: Element): string | null {
	// data-language / data-lang 属性をチェック（最優先）
	const dataLanguage = el.getAttribute("data-language") || el.getAttribute("data-lang");
	if (dataLanguage) return dataLanguage;

	// 子要素の pre タグの data-language 属性をチェック
	const preEl = el.querySelector("pre[data-language]");
	if (preEl) {
		const preLang = preEl.getAttribute("data-language");
		if (preLang) return preLang;
	}

	// class 属性から言語パターンを検出
	const className = el.className;
	if (className) {
		for (const pattern of LANGUAGE_CLASS_PATTERNS) {
			const match = className.match(pattern);
			if (match?.[1]) {
				return match[1];
			}
		}
	}

	// 子要素の code タグのクラスから言語を検出
	const codeEl = el.querySelector("code");
	if (codeEl) {
		const codeClass = codeEl.className;
		if (codeClass) {
			for (const pattern of LANGUAGE_CLASS_PATTERNS) {
				const match = codeClass.match(pattern);
				if (match?.[1]) {
					return match[1];
				}
			}
		}
	}

	return null;
}

/** HTML を Markdown に変換 */
export function htmlToMarkdown(html: string): string {
	const turndown = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
	});

	turndown.use(gfm);

	// 空のリンクを除去
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});

	// Syntax Highlighter系のdiv要素をコードブロックとして変換
	turndown.addRule("syntaxHighlighter", {
		filter: (node) => {
			// data-rehype-pretty-code-fragment や hljs, prism-code, shiki クラスを持つ要素
			return (
				node.nodeName === "DIV" &&
				(node.hasAttribute("data-rehype-pretty-code-fragment") ||
					node.classList.contains("hljs") ||
					node.classList.contains("prism-code") ||
					node.classList.contains("shiki") ||
					node.classList.contains("highlight") ||
					node.classList.contains("code-block"))
			);
		},
		replacement: (_content, node) => {
			const language = detectLanguage(node as Element);
			const codeContent = extractCodeContent(node as Element);
			const lang = language || "";
			return `\n\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n\n`;
		},
	});

	// Torchlight 対応（pre > code.torchlight 構造、行番号を除去）
	// Note: Turndown内部DOMではquerySelectorのクラスセレクタが正しく動作しないため、
	// getAttribute('class')で明示的にチェックする
	turndown.addRule("torchlight", {
		filter: (node) => {
			if (node.nodeName !== "PRE") return false;
			const code = node.querySelector("code");
			if (!code) return false;
			const cls = code.getAttribute("class") || "";
			return cls.includes("torchlight");
		},
		replacement: (_content, node) => {
			const codeEl = (node as Element).querySelector("code");
			if (!codeEl) return _content;
			const language = detectLanguage(codeEl as Element);
			const codeContent = extractCodeContent(node as Element);
			const lang = language || "";
			return `\n\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n\n`;
		},
	});

	// figure[data-rehype-pretty-code-figure] 対応
	turndown.addRule("prettyCodeFigure", {
		filter: (node) => {
			return node.nodeName === "FIGURE" && node.hasAttribute("data-rehype-pretty-code-figure");
		},
		replacement: (_content, node) => {
			const language = detectLanguage(node as Element);
			const codeContent = extractCodeContent(node as Element);
			const lang = language || "";
			return `\n\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n\n`;
		},
	});

	return turndown
		.turndown(html)
		.replace(/\[\\\[\s*\\\]\]\([^)]*\)/g, "") // 壊れたリンク除去
		.replace(/ +/g, " ") // 複数スペースを1つに
		.replace(/\s+,/g, ",") // カンマ前のスペース除去
		.replace(/\s+\./g, ".") // ピリオド前のスペース除去
		.replace(/\n{3,}/g, "\n\n") // 3つ以上の改行を2つに
		.trim();
}

/**
 * コード要素の innerHTML から行番号要素を除去する正規表現パターン
 *
 * Torchlight: <span class="line-number">1</span>
 * highlight.js: <td class="hljs-ln-numbers">...</td>
 * Generic: <span class="linenumber">1</span>, <span data-line-number="1">1</span>
 */
const LINE_NUMBER_HTML_PATTERNS = [
	/<span[^>]*\bclass\s*=\s*["'][^"']*\bline-number\b[^"']*["'][^>]*>.*?<\/span>/gi,
	/<span[^>]*\bclass\s*=\s*["'][^"']*\blinenumber\b[^"']*["'][^>]*>.*?<\/span>/gi,
	/<span[^>]*\bdata-line-number\s*=\s*["'][^"']*["'][^>]*>.*?<\/span>/gi,
	/<td[^>]*\bclass\s*=\s*["'][^"']*\bhljs-ln-numbers\b[^"']*["'][^>]*>.*?<\/td>/gi,
];

/** innerHTML から行番号要素を除去した textContent を取得 */
function getTextWithoutLineNumbers(el: Element): string {
	let html = el.innerHTML;
	// 行番号要素を除去
	for (const pattern of LINE_NUMBER_HTML_PATTERNS) {
		html = html.replace(pattern, "");
	}
	// 行区切り要素（div.line など）の閉じタグを改行に変換
	html = html.replace(/<\/div>/gi, "\n");
	// 残りのタグを除去して textContent 相当を取得
	return (
		html
			.replace(/<[^>]+>/g, "")
			// 数値エンティティの汎用デコード（名前付きエンティティより前に処理）
			.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
			.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
			// 名前付きエンティティのデコード
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&amp;/g, "&") // &amp; は最後にデコード（二重デコード防止）
			.replace(/&nbsp;/g, " ")
			.replace(/\n{2,}/g, "\n") // 連続改行を1つに
			.trim()
	);
}

/** コード要素から実際のコード内容を抽出（行番号を除去） */
function extractCodeContent(el: Element): string {
	// pre > code 構造を優先
	const pre = el.querySelector("pre");
	const target = pre || el.querySelector("code") || el;

	// 行番号を含むハイライターかどうかを判定
	const html = target.innerHTML || "";
	const hasLineNumbers = LINE_NUMBER_HTML_PATTERNS.some((pattern) => {
		pattern.lastIndex = 0; // reset regex state
		return pattern.test(html);
	});

	if (hasLineNumbers) {
		return getTextWithoutLineNumbers(target);
	}

	return target.textContent?.trim() || "";
}
