/** クローラー基底エラー */
export class CrawlError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		cause?: unknown,
	) {
		super(message, cause !== undefined ? { cause } : undefined);
		this.name = "CrawlError";
	}

	toString(): string {
		if (this.cause !== undefined) {
			const causeMsg =
				this.cause instanceof Error
					? this.cause.message
					: typeof this.cause === "object"
						? JSON.stringify(this.cause)
						: String(this.cause);
			return `${this.name}[${this.code}]: ${this.message}\nCaused by: ${causeMsg}`;
		}
		return `${this.name}[${this.code}]: ${this.message}`;
	}
}

/** フェッチ関連エラー */
export class FetchError extends CrawlError {
	constructor(
		message: string,
		public readonly url: string,
		cause?: unknown,
	) {
		super(message, "FETCH_ERROR", cause);
		this.name = "FetchError";
	}
}

/** 設定関連エラー */
export class ConfigError extends CrawlError {
	constructor(
		message: string,
		public readonly configKey?: string,
	) {
		super(message, "CONFIG_ERROR");
		this.name = "ConfigError";
	}
}

/** 依存関係エラー */
export class DependencyError extends CrawlError {
	constructor(
		message: string,
		public readonly dependency: string,
	) {
		super(message, "DEPENDENCY_ERROR");
		this.name = "DependencyError";
	}
}

/** タイムアウトエラー */
export class TimeoutError extends CrawlError {
	constructor(
		message: string,
		public readonly timeoutMs: number,
	) {
		super(message, "TIMEOUT_ERROR");
		this.name = "TimeoutError";
	}
}
