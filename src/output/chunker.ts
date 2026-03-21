import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILENAME } from "../constants.js";

/**
 * Markdownチャンク分割クラス
 * full.mdをH1見出しベースでチャンク分割
 */
export class Chunker {
	constructor(private outputDir: string) {}

	/**
	 * MarkdownをH1見出しで分割
	 * @param fullMarkdown 結合されたMarkdown文字列
	 * @returns 分割されたチャンクの配列
	 */
	chunk(fullMarkdown: string): string[] {
		if (!fullMarkdown.trim()) {
			return [];
		}

		// H1見出し（# ）で分割
		// ただし、frontmatter内の#は除外
		const chunks: string[] = [];
		const lines = fullMarkdown.split("\n");
		let currentChunk: string[] = [];
		let inFrontmatter = false;
		let frontmatterEnded = false; // frontmatter終了フラグ
		let isFirstH1 = true;
		let seenNonEmptyLine = false; // 非空行検出フラグ

		for (const line of lines) {
			// frontmatter検出（ファイル先頭のみ）
			if (line.trim() === "---" && !frontmatterEnded) {
				// 先頭の空行をスキップした後の最初の---
				if (!seenNonEmptyLine) {
					inFrontmatter = true;
					currentChunk.push(line);
					seenNonEmptyLine = true;
					continue;
				}

				// frontmatter内で2番目の---を検出
				if (inFrontmatter) {
					inFrontmatter = false;
					frontmatterEnded = true;
					currentChunk.push(line);
					continue;
				}
			}

			// 非空行を検出（frontmatterがない場合）
			if (line.trim() !== "" && !seenNonEmptyLine) {
				seenNonEmptyLine = true;
				frontmatterEnded = true; // frontmatterなし確定
			}

			// frontmatter内は無条件で追加
			if (inFrontmatter) {
				currentChunk.push(line);
				continue;
			}

			// H1見出しの検出（行頭が"# "）
			if (line.startsWith("# ")) {
				if (!isFirstH1 && currentChunk.length > 0) {
					// 前のチャンクを保存
					chunks.push(currentChunk.join("\n").trim());
					currentChunk = [];
				}
				isFirstH1 = false;
			}

			currentChunk.push(line);
		}

		// 最後のチャンクを追加
		if (currentChunk.length > 0) {
			chunks.push(currentChunk.join("\n").trim());
		}

		return chunks.filter((chunk) => chunk.length > 0);
	}

	/**
	 * チャンクをファイルに出力
	 * @param chunks チャンクの配列
	 * @returns 出力されたファイルパスの配列
	 */
	writeChunks(chunks: string[]): string[] {
		if (chunks.length === 0) {
			return [];
		}

		// chunksディレクトリ作成（古いチャンクを削除してから）
		const chunksDir = join(this.outputDir, FILENAME.CHUNKS_DIR);
		if (existsSync(chunksDir)) {
			rmSync(chunksDir, { recursive: true, force: true });
		}
		mkdirSync(chunksDir, { recursive: true });

		const outputPaths: string[] = [];

		for (let i = 0; i < chunks.length; i++) {
			const chunkNum = String(i + 1).padStart(3, "0");
			const chunkFile = `chunk-${chunkNum}.md`;
			const chunkPath = join(chunksDir, chunkFile);

			writeFileSync(chunkPath, chunks[i]);
			outputPaths.push(chunkPath);
		}

		return outputPaths;
	}

	/**
	 * full.mdを読み込んでチャンク分割し、ファイルに出力
	 * @param fullMarkdown 結合されたMarkdown文字列
	 * @returns 出力されたファイルパスの配列
	 */
	chunkAndWrite(fullMarkdown: string): string[] {
		const chunks = this.chunk(fullMarkdown);
		return this.writeChunks(chunks);
	}
}
