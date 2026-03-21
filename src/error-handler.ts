import { EXIT_CODES } from "./constants.js";
import { ConfigError, CrawlError, DependencyError, FetchError, TimeoutError } from "./errors.js";

export interface ErrorHandlerResult {
	message: string;
	exitCode: number;
}

/**
 * Handle errors from the crawler and return appropriate message and exit code
 *
 * @param error - The error to handle
 * @returns Object containing error message and exit code
 */
export function handleError(error: unknown): ErrorHandlerResult {
	if (error instanceof DependencyError) {
		return {
			message: `✗ ${error.message}`,
			exitCode: EXIT_CODES.DEPENDENCY_ERROR,
		};
	}

	if (error instanceof ConfigError) {
		return {
			message: `✗ Configuration error: ${error.message}`,
			exitCode: EXIT_CODES.INVALID_ARGUMENTS,
		};
	}

	if (error instanceof FetchError) {
		return {
			message: `✗ Fetch error at ${error.url}: ${error.message}`,
			exitCode: EXIT_CODES.CRAWL_ERROR,
		};
	}

	if (error instanceof TimeoutError) {
		return {
			message: `✗ Request timeout after ${error.timeoutMs}ms`,
			exitCode: EXIT_CODES.CRAWL_ERROR,
		};
	}

	// Note: CrawlError check must come after all subclasses (TimeoutError, FetchError, etc.)
	// to ensure specific error handling takes precedence over the generic handler.
	if (error instanceof CrawlError) {
		return {
			message: `✗ ${error.toString()}`,
			exitCode: EXIT_CODES.CRAWL_ERROR,
		};
	}

	// Unknown error
	const message = error instanceof Error ? error.message : String(error);
	return {
		message: `✗ Fatal error: ${message}`,
		exitCode: EXIT_CODES.GENERAL_ERROR,
	};
}
