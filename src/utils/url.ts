/** クエリパラメータを除去したURLを返す */
export function stripQueryParams(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.search = "";
		return parsed.href;
	} catch {
		return url;
	}
}
