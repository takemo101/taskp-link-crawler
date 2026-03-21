/**
 * Generate a site name from a URL for use in directory naming
 *
 * Examples:
 * - https://nextjs.org/docs → nextjs-docs
 * - https://www.example.com → example
 * - https://docs.example.com/api → example-api
 *
 * @param url - The URL to generate a site name from
 * @returns A filesystem-safe site name
 */
export function generateSiteName(url: string): string {
	try {
		const parsed = new URL(url);
		let hostname = parsed.hostname;

		// Remove 'www.' prefix
		hostname = hostname.replace(/^www\./, "");

		// Remove known subdomains (docs, api, www, etc.)
		hostname = hostname.replace(/^(docs?|api|www|blog|dev|stage|staging)\./, "");

		// Remove multi-part TLDs (.co.uk, .com.au, etc.) and single TLDs
		hostname = hostname.replace(/\.(co|com|ac|gov|org|net)\.[a-z]{2,}$/i, "");
		hostname = hostname.replace(/\.[a-z]{2,}$/i, "");

		// Get first path segment if it exists
		const pathSegments = parsed.pathname.split("/").filter((s) => s.length > 0);
		const firstPath = pathSegments[0] || "";

		// Combine hostname and path
		let siteName = firstPath ? `${hostname}-${firstPath}` : hostname;

		// Replace invalid characters with hyphens
		siteName = siteName.replace(/[^a-zA-Z0-9-]/g, "-");

		// Compress consecutive hyphens
		siteName = siteName.replace(/-+/g, "-");

		// Remove leading/trailing hyphens
		siteName = siteName.replace(/^-|-$/g, "");

		return siteName || "site";
	} catch {
		// If URL parsing fails, return a safe default
		return "site";
	}
}
