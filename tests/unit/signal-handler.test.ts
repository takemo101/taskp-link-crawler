/**
 * Signal Handler Unit Tests
 *
 * Tests graceful shutdown logic extracted from crawl.ts.
 * Addresses Issue #857 - testing signal handlers that were previously untested.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalHandler } from "../../src/signal-handler.js";

describe("SignalHandler", () => {
	let mockConsole: Console;
	let processExitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Mock console to avoid test output pollution
		mockConsole = {
			log: vi.fn(),
			error: vi.fn(),
		} as unknown as Console;

		// Mock process.exit to prevent actual exit
		processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create handler with default exit code", () => {
			const handler = new SignalHandler({
				onShutdown: vi.fn(),
			});

			expect(handler).toBeInstanceOf(SignalHandler);
		});

		it("should create handler with custom exit code", () => {
			const handler = new SignalHandler({
				onShutdown: vi.fn(),
				exitCode: 42,
			});

			expect(handler).toBeInstanceOf(SignalHandler);
		});

		it("should create handler with custom console", () => {
			const handler = new SignalHandler({
				onShutdown: vi.fn(),
				console: mockConsole,
			});

			expect(handler).toBeInstanceOf(SignalHandler);
		});
	});

	describe("handleShutdown", () => {
		it("should call cleanup function on first signal", async () => {
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			await handler.handleShutdown("SIGINT");

			expect(cleanupFn).toHaveBeenCalledTimes(1);
			expect(mockConsole.log).toHaveBeenCalledWith("\n⚠️  Received SIGINT. Cleaning up...");
			expect(mockConsole.log).toHaveBeenCalledWith("✓ Cleanup complete");
			expect(processExitSpy).toHaveBeenCalledWith(1);
		});

		it("should use custom exit code", async () => {
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				exitCode: 42,
				console: mockConsole,
			});

			await handler.handleShutdown("SIGTERM");

			expect(processExitSpy).toHaveBeenCalledWith(42);
		});

		it("should force exit on second signal without calling cleanup again", async () => {
			const cleanupFn = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			// First signal - starts cleanup (don't await to let it run in background)
			handler.handleShutdown("SIGINT");

			// Wait a tiny bit for the first signal to set the cleanup flag
			await new Promise((resolve) => setTimeout(resolve, 5));

			// Second signal - should force exit immediately
			await handler.handleShutdown("SIGINT");

			expect(mockConsole.log).toHaveBeenCalledWith("\n⚠️  Force exit");
			expect(processExitSpy).toHaveBeenCalledWith(1);

			// Cleanup should only be called once (from first signal)
			expect(cleanupFn).toHaveBeenCalledTimes(1);
		});

		it("should handle cleanup errors gracefully", async () => {
			const error = new Error("Cleanup failed");
			const cleanupFn = vi.fn().mockRejectedValue(error);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			await handler.handleShutdown("SIGTERM");

			expect(mockConsole.log).toHaveBeenCalledWith("\n⚠️  Received SIGTERM. Cleaning up...");
			expect(mockConsole.error).toHaveBeenCalledWith("Error during shutdown:", error);
			expect(processExitSpy).toHaveBeenCalledWith(1);
		});

		it("should handle different signal names", async () => {
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			await handler.handleShutdown("SIGTERM");

			expect(mockConsole.log).toHaveBeenCalledWith("\n⚠️  Received SIGTERM. Cleaning up...");
		});

		it("should set cleanup in progress flag", async () => {
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			expect(handler.isCleanupInProgress()).toBe(false);

			const shutdownPromise = handler.handleShutdown("SIGINT");

			// Should be true during cleanup
			expect(handler.isCleanupInProgress()).toBe(true);

			await shutdownPromise;
		});
	});

	describe("install/uninstall", () => {
		it("should install signal handlers", () => {
			const cleanupFn = vi.fn();
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			const processOnSpy = vi.spyOn(process, "on");

			handler.install();

			expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
			expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

			processOnSpy.mockRestore();
		});

		it("should uninstall signal handlers", () => {
			const cleanupFn = vi.fn();
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			const processOffSpy = vi.spyOn(process, "off");

			handler.install();
			handler.uninstall();

			expect(processOffSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
			expect(processOffSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

			processOffSpy.mockRestore();
		});

		it("should handle uninstall without install", () => {
			const cleanupFn = vi.fn();
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			// Should not throw
			expect(() => handler.uninstall()).not.toThrow();
		});

		it("should prevent listener leak when install() is called multiple times", () => {
			const cleanupFn = vi.fn();
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			// Get initial listener count
			const initialSigintCount = process.listenerCount("SIGINT");
			const initialSigtermCount = process.listenerCount("SIGTERM");

			// Install handlers multiple times
			handler.install();
			handler.install();
			handler.install();

			// Should only have +1 listener for each signal (not +3)
			expect(process.listenerCount("SIGINT")).toBe(initialSigintCount + 1);
			expect(process.listenerCount("SIGTERM")).toBe(initialSigtermCount + 1);

			// Cleanup
			handler.uninstall();

			// Should be back to initial count
			expect(process.listenerCount("SIGINT")).toBe(initialSigintCount);
			expect(process.listenerCount("SIGTERM")).toBe(initialSigtermCount);
		});

		it("should catch errors in signal handler callbacks", async () => {
			const error = new Error("Shutdown error");
			const cleanupFn = vi.fn().mockRejectedValue(error);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				exitCode: 5,
				console: mockConsole,
			});

			handler.install();

			// Get the installed SIGINT handler
			const listeners = process.listeners("SIGINT");
			const sigintHandler = listeners[listeners.length - 1];

			// Call it directly
			if (typeof sigintHandler === "function") {
				sigintHandler("SIGINT");
			}

			// Give it time to process
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockConsole.error).toHaveBeenCalledWith("Error during shutdown:", error);
			expect(processExitSpy).toHaveBeenCalledWith(5);

			handler.uninstall();
		});

		it("should handle SIGTERM signal", async () => {
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			handler.install();

			// Get the installed SIGTERM handler
			const listeners = process.listeners("SIGTERM");
			const sigtermHandler = listeners[listeners.length - 1];

			// Call it directly
			if (typeof sigtermHandler === "function") {
				sigtermHandler("SIGTERM");
			}

			// Give it time to process
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockConsole.log).toHaveBeenCalledWith("\n⚠️  Received SIGTERM. Cleaning up...");

			handler.uninstall();
		});

		it("should catch and handle errors from handleShutdown in SIGINT handler", async () => {
			const error = new Error("handleShutdown failed");
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				exitCode: 5,
				console: mockConsole,
			});

			// Spy and mock handleShutdown to reject
			vi.spyOn(handler, "handleShutdown").mockRejectedValue(error);

			handler.install();

			// Get the installed SIGINT handler
			const listeners = process.listeners("SIGINT");
			const sigintHandler = listeners[listeners.length - 1];

			// Trigger SIGINT
			if (typeof sigintHandler === "function") {
				sigintHandler("SIGINT");
			}

			// Wait for async error handling
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify .catch() path was executed (lines 63-64)
			expect(mockConsole.error).toHaveBeenCalledWith("Error during shutdown:", error);
			expect(processExitSpy).toHaveBeenCalledWith(5);

			handler.uninstall();
		});

		it("should catch and handle errors from handleShutdown in SIGTERM handler", async () => {
			const error = new Error("handleShutdown failed");
			const cleanupFn = vi.fn().mockResolvedValue(undefined);
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				exitCode: 7,
				console: mockConsole,
			});

			// Spy and mock handleShutdown to reject
			vi.spyOn(handler, "handleShutdown").mockRejectedValue(error);

			handler.install();

			// Get the installed SIGTERM handler
			const listeners = process.listeners("SIGTERM");
			const sigtermHandler = listeners[listeners.length - 1];

			// Trigger SIGTERM
			if (typeof sigtermHandler === "function") {
				sigtermHandler("SIGTERM");
			}

			// Wait for async error handling
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify .catch() path was executed (lines 70-71)
			expect(mockConsole.error).toHaveBeenCalledWith("Error during shutdown:", error);
			expect(processExitSpy).toHaveBeenCalledWith(7);

			handler.uninstall();
		});
	});

	describe("isCleanupInProgress", () => {
		it("should return false initially", () => {
			const handler = new SignalHandler({
				onShutdown: vi.fn(),
			});

			expect(handler.isCleanupInProgress()).toBe(false);
		});

		it("should return true after shutdown starts", async () => {
			const cleanupFn = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			const shutdownPromise = handler.handleShutdown("SIGINT");

			expect(handler.isCleanupInProgress()).toBe(true);

			await shutdownPromise;
		});
	});

	describe("edge cases", () => {
		it("should handle rapid successive signals", async () => {
			const cleanupFn = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			// Fire first signal (don't await)
			handler.handleShutdown("SIGINT");

			// Wait a tiny bit for cleanup flag to be set
			await new Promise((resolve) => setTimeout(resolve, 5));

			// Fire subsequent signals
			await handler.handleShutdown("SIGINT");
			await handler.handleShutdown("SIGINT");

			// Only first signal should trigger cleanup
			expect(cleanupFn).toHaveBeenCalledTimes(1);
			expect(mockConsole.log).toHaveBeenCalledWith("\n⚠️  Force exit");
		});

		it("should handle cleanup function that takes time", async () => {
			let cleanupCompleted = false;
			const cleanupFn = vi.fn().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				cleanupCompleted = true;
			});
			const handler = new SignalHandler({
				onShutdown: cleanupFn,
				console: mockConsole,
			});

			await handler.handleShutdown("SIGINT");

			expect(cleanupCompleted).toBe(true);
			expect(mockConsole.log).toHaveBeenCalledWith("✓ Cleanup complete");
		});
	});
});
