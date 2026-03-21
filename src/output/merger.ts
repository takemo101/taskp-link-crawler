import type { CrawledPage, Logger } from "../types.js";

/**
 * ページ結合クラス
 * 全ページを結合してfull.mdを生成
 */
export class Merger {
	private logger?: Logger;

	constructor(logger?: Logger) {
		this.logger = logger;
	}
	/**
	 * Markdownから先頭のH1タイトルを除去
	 * frontmatterがある場合は考慮する
	 * @param markdown Markdown文字列
	 * @returns タイトル除去後のMarkdown
	 */
	stripTitle(markdown: string): string {
		// frontmatterをスキップ
		let content = markdown;
		if (content.startsWith("---")) {
			const endIndex = content.indexOf("---", 3);
			if (endIndex !== -1) {
				content = content.slice(endIndex + 3).trimStart();
			}
		}

		// 先頭のH1を除去
		const lines = content.split("\n");
		if (lines.length > 0 && lines[0].startsWith("# ")) {
			lines.shift();
			// タイトル後の空行も除去
			while (lines.length > 0 && lines[0].trim() === "") {
				lines.shift();
			}
		}

		return lines.join("\n");
	}

	/**
	 * Markdownを結合してfull.md内容を生成（ファイル書き込みなし）
	 * @param pages クロール済みページ一覧
	 * @param pageContents ページ内容のMap (file -> markdown)
	 * @returns 結合されたMarkdown文字列
	 */
	buildFullContent(pages: CrawledPage[], pageContents: Map<string, string>): string {
		const sections: string[] = [];

		for (const page of pages) {
			const title = page.title || page.url;
			const header = `# ${title}`;
			const urlLine = `> Source: ${page.url}`;

			const rawContent = pageContents.get(page.file);
			if (rawContent === undefined) {
				this.logger?.logDebug("Missing content for page", {
					file: page.file,
					url: page.url,
				});
			}
			const content = this.stripTitle(rawContent ?? "");

			sections.push(`${header}\n\n${urlLine}\n\n${content}`);
		}

		return sections.join("\n\n---\n\n");
	}
}
