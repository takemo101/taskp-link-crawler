import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["tests/**/*.test.ts"],
		globalSetup: "./tests/global-setup.ts",
		globalTeardown: "./tests/global-teardown.ts",
		// Enable file-level parallelism for faster test execution
		// forks pool provides complete isolation between test files
		fileParallelism: true,
		// forksプールを使用して各テストファイルを完全に分離
		// (threadsではなくforksを使用することで、module mocksが他のファイルに影響しない)
		pool: "forks",
		// テスト間でモックをクリアして分離を確保
		clearMocks: true,
		mockReset: true,
		restoreMocks: true,
		// 各テストファイルを完全に分離
		isolate: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			include: ["src/**/*.ts"],
			exclude: ["src/crawl.ts", "src/types.ts", "src/types/**", "src/diff/index.ts"],
		},
	},
});
