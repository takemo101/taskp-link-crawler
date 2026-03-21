/**
 * Signal Handler Module
 *
 * Handles graceful shutdown on SIGINT/SIGTERM signals.
 * Extracted from crawl.ts for better testability.
 */

export interface SignalHandlerOptions {
	/** Async cleanup function to call on shutdown */
	onShutdown: () => Promise<void>;
	/** Exit code to use after cleanup (default: 1) */
	exitCode?: number;
	/** Console object for output (injectable for testing) */
	console?: Console;
}

export class SignalHandler {
	private cleanupInProgress = false;
	private sigintHandler?: NodeJS.SignalsListener;
	private sigtermHandler?: NodeJS.SignalsListener;
	private readonly exitCode: number;
	private readonly consoleOutput: Console;

	constructor(private options: SignalHandlerOptions) {
		this.exitCode = options.exitCode ?? 1;
		this.consoleOutput = options.console ?? console;
	}

	/**
	 * Handle shutdown signal
	 * - First signal: start cleanup
	 * - Second signal: force exit
	 */
	async handleShutdown(signal: string): Promise<void> {
		if (this.cleanupInProgress) {
			// 2回目以降のシグナルは即座に終了
			this.consoleOutput.log("\n⚠️  Force exit");
			process.exit(this.exitCode);
			return; // For testing when process.exit is mocked
		}

		// Set flag immediately to prevent race conditions
		this.cleanupInProgress = true;

		this.consoleOutput.log(`\n⚠️  Received ${signal}. Cleaning up...`);

		try {
			await this.options.onShutdown();
			this.consoleOutput.log("✓ Cleanup complete");
		} catch (err) {
			this.consoleOutput.error("Error during shutdown:", err);
		}

		process.exit(this.exitCode);
	}

	/**
	 * Install signal handlers for SIGINT and SIGTERM
	 */
	install(): void {
		// Remove existing handlers before installing new ones to prevent listener leaks
		this.uninstall();

		this.sigintHandler = () => {
			this.handleShutdown("SIGINT").catch((err) => {
				this.consoleOutput.error("Error during shutdown:", err);
				process.exit(this.exitCode);
			});
		};

		this.sigtermHandler = () => {
			this.handleShutdown("SIGTERM").catch((err) => {
				this.consoleOutput.error("Error during shutdown:", err);
				process.exit(this.exitCode);
			});
		};

		process.on("SIGINT", this.sigintHandler);
		process.on("SIGTERM", this.sigtermHandler);
	}

	/**
	 * Remove signal handlers (useful for testing)
	 */
	uninstall(): void {
		if (this.sigintHandler) {
			process.off("SIGINT", this.sigintHandler);
		}
		if (this.sigtermHandler) {
			process.off("SIGTERM", this.sigtermHandler);
		}
	}

	/**
	 * Check if cleanup is in progress
	 */
	isCleanupInProgress(): boolean {
		return this.cleanupInProgress;
	}
}
