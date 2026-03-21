/** robots.txt のルール */
export interface RobotsRule {
	userAgent: string;
	disallow: string[];
	allow: string[];
}

/** robots.txt のパーサーとチェッカー */
export class RobotsChecker {
	private rules: RobotsRule[] = [];
	private userAgent: string;

	constructor(robotsTxt: string, userAgent = "link-crawler") {
		this.userAgent = userAgent;
		// HTMLタグを除去してからパース（playwright-cli互換性のため）
		const plainText = this.stripHtml(robotsTxt);
		this.parse(plainText);
	}

	/** HTMLタグを除去してプレーンテキストを抽出 */
	private stripHtml(text: string): string {
		// <pre> タグで囲まれている場合は中身を抽出
		const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
		if (preMatch) {
			return this.decodeHtmlEntities(preMatch[1]);
		}

		// <br> タグを改行に変換（<br>, <br/>, <br />, <BR> など）
		let processed = text.replace(/<br\s*\/?>/gi, "\n");

		// その他のHTMLタグを除去
		processed = processed.replace(/<[^>]*>/g, "");
		return this.decodeHtmlEntities(processed);
	}

	/** HTML エンティティをデコード */
	private decodeHtmlEntities(text: string): string {
		return text
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
	}

	/** robots.txt をパース */
	private parse(robotsTxt: string): void {
		const lines = robotsTxt.split(/\r?\n/);
		let currentAgent: string | null = null;
		const ruleMap = new Map<string, RobotsRule>();

		for (const line of lines) {
			const trimmed = line.trim();

			// コメントと空行をスキップ
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}

			// "Key: Value" 形式のパース
			const colonIndex = trimmed.indexOf(":");
			if (colonIndex === -1) {
				continue;
			}

			const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
			const value = trimmed.substring(colonIndex + 1).trim();

			if (key === "user-agent") {
				currentAgent = value.toLowerCase();
				if (!ruleMap.has(currentAgent)) {
					ruleMap.set(currentAgent, {
						userAgent: currentAgent,
						disallow: [],
						allow: [],
					});
				}
			} else if (currentAgent && (key === "disallow" || key === "allow")) {
				const rule = ruleMap.get(currentAgent);
				if (rule) {
					if (key === "disallow") {
						rule.disallow.push(value);
					} else {
						rule.allow.push(value);
					}
				}
			}
		}

		this.rules = Array.from(ruleMap.values());
	}

	/** URL がクロール許可されているか判定 */
	isAllowed(url: string): boolean {
		const path = this.getPath(url);

		// 該当する User-Agent ルールを取得（優先順位: 指定 > *）
		const rule =
			this.rules.find((r) => r.userAgent === this.userAgent.toLowerCase()) ||
			this.rules.find((r) => r.userAgent === "*");

		if (!rule) {
			// ルールがない場合は全許可
			return true;
		}

		// 最長一致ルールを見つける（より具体的なルールが優先）
		let longestMatch = "";
		let isAllowedByLongestMatch = true;

		// Disallow ルールをチェック
		for (const disallowPath of rule.disallow) {
			if (this.matchPath(path, disallowPath) && disallowPath.length > longestMatch.length) {
				longestMatch = disallowPath;
				isAllowedByLongestMatch = false;
			}
		}

		// Allow ルールをチェック（Disallow より優先度高い）
		for (const allowPath of rule.allow) {
			if (this.matchPath(path, allowPath) && allowPath.length > longestMatch.length) {
				longestMatch = allowPath;
				isAllowedByLongestMatch = true;
			}
		}

		// マッチするルールがない場合は許可
		if (!longestMatch) {
			return true;
		}

		return isAllowedByLongestMatch;
	}

	/** URL からパスを抽出 */
	private getPath(url: string): string {
		try {
			const parsed = new URL(url);
			return parsed.pathname + parsed.search;
		} catch {
			// URL パース失敗時はそのまま返す
			return url;
		}
	}

	/** パスがルールにマッチするか（ワイルドカード・終端パターン対応） */
	private matchPath(path: string, rulePath: string): boolean {
		// 空の Disallow は「全許可」を意味する
		if (!rulePath) {
			return false;
		}

		// 防御: パターン長とワイルドカード数を制限（ReDoS対策）
		if (rulePath.length > 500) {
			return false;
		}
		const wildcardCount = (rulePath.match(/\*/g) || []).length;
		if (wildcardCount > 10) {
			return false;
		}

		// $ 終端マーカーの処理
		const exactEnd = rulePath.endsWith("$");
		const pattern = exactEnd ? rulePath.slice(0, -1) : rulePath;

		// * ワイルドカードが含まれる場合 - 手動マッチング（ReDoS回避）
		if (pattern.includes("*")) {
			return this.matchWildcard(path, pattern, exactEnd);
		}

		// 通常の前方一致（既存の動作を維持）
		if (exactEnd) {
			return path === pattern;
		}
		return path.startsWith(pattern);
	}

	/** ワイルドカードパターンマッチング（正規表現を使わない安全な実装） */
	private matchWildcard(text: string, pattern: string, exactEnd: boolean): boolean {
		const segments = pattern.split("*");
		let textIndex = 0;

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const isFirstSegment = i === 0;
			const isLastSegment = i === segments.length - 1;

			// 空のセグメントはスキップ
			// - パターンが * で始まる場合: 先頭セグメントが空文字列となり、
			//   isFirstSegment の前方一致チェックが不要になる（意図通り）
			// - 連続する ** の場合: 中間の空セグメントをスキップ
			if (segment.length === 0) {
				continue;
			}

			if (isFirstSegment) {
				// 最初のセグメント: 前方一致でなければならない
				if (!text.startsWith(segment)) {
					return false;
				}
				textIndex = segment.length;
			} else if (isLastSegment) {
				// 最後のセグメント
				if (exactEnd) {
					// 終端マーカーあり: 後方一致でなければならない
					if (!text.endsWith(segment)) {
						return false;
					}
					// さらに、このセグメントが現在位置より後ろにあることを確認
					const remainingText = text.slice(textIndex);
					const segmentIndex = remainingText.indexOf(segment);
					if (segmentIndex === -1) {
						return false;
					}
					// 終端マーカーなので、セグメント終了位置がテキスト末尾と一致する必要がある
					if (textIndex + segmentIndex + segment.length !== text.length) {
						return false;
					}
				} else {
					// 終端マーカーなし: 現在位置以降のどこかにあればOK
					const remainingText = text.slice(textIndex);
					const segmentIndex = remainingText.indexOf(segment);
					if (segmentIndex === -1) {
						return false;
					}
					textIndex += segmentIndex + segment.length;
				}
			} else {
				// 中間セグメント: 現在位置以降のどこかにあればOK
				const remainingText = text.slice(textIndex);
				const segmentIndex = remainingText.indexOf(segment);
				if (segmentIndex === -1) {
					return false;
				}
				textIndex += segmentIndex + segment.length;
			}
		}

		return true;
	}
}
