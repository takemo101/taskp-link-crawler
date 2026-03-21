import { createHash } from "node:crypto";

/**
 * コンテンツのSHA256ハッシュを計算
 * @param content ハッシュ計算対象の文字列
 * @returns SHA256ハッシュ（16進数文字列）
 */
export function computeHash(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * ハッシュ管理クラス
 * 差分検知を行う
 */
export class Hasher {
	private hashes: Map<string, string>;

	/**
	 * @param existingHashes 既存のハッシュMap（URL → hash）
	 */
	constructor(existingHashes: Map<string, string> = new Map()) {
		this.hashes = new Map(existingHashes);
	}

	/**
	 * URLのコンテンツが変更されたかを判定
	 * @param url 対象URL
	 * @param newHash 新しいハッシュ値
	 * @returns 変更があればtrue、なければfalse
	 */
	isChanged(url: string, newHash: string): boolean {
		const existingHash = this.hashes.get(url);
		if (existingHash === undefined) {
			return true; // 新規ページは変更扱い
		}
		return existingHash !== newHash;
	}

	/**
	 * 読み込まれたハッシュの数を取得
	 */
	get size(): number {
		return this.hashes.size;
	}
}
