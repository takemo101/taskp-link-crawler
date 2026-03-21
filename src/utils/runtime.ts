/** プロセス実行結果 */
export interface SpawnResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

/** ランタイムアダプターインターフェース */
export interface RuntimeAdapter {
	/**
	 * コマンドを実行して結果を返す
	 * @param cwd 作業ディレクトリ（省略時はprocess.cwd()）
	 */
	spawn(command: string, args: string[], cwd?: string): Promise<SpawnResult>;

	/**
	 * 指定時間スリープする
	 */
	sleep(ms: number): Promise<void>;

	/**
	 * ファイルを読み込む
	 */
	readFile(path: string): Promise<string>;

	/**
	 * カレントワーキングディレクトリを取得する
	 */
	cwd(): string;
}

/** Bun APIのサブセット（テスト用モック可能にするため） */
export interface BunAPI {
	spawn: typeof Bun.spawn;
	sleep: typeof Bun.sleep;
	file: typeof Bun.file;
}

/** Bunランタイムアダプター */
export class BunRuntimeAdapter implements RuntimeAdapter {
	constructor(private bunApi: BunAPI = globalThis.Bun) {}

	async spawn(command: string, args: string[], cwd?: string): Promise<SpawnResult> {
		try {
			const proc = this.bunApi.spawn([command, ...args], {
				stdout: "pipe",
				stderr: "pipe",
				...(cwd ? { cwd } : {}),
			});
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();
			const exitCode = await proc.exited;
			return { success: exitCode === 0, stdout, stderr, exitCode };
		} catch (error) {
			return {
				success: false,
				stdout: "",
				stderr: error instanceof Error ? error.message : "command not found",
				exitCode: -1,
			};
		}
	}

	async sleep(ms: number): Promise<void> {
		return this.bunApi.sleep(ms);
	}

	async readFile(path: string): Promise<string> {
		const file = this.bunApi.file(path);
		return file.text();
	}

	cwd(): string {
		return process.cwd();
	}
}

/** 汎用ランタイムアダプター（Node.js互換） */
export class NodeRuntimeAdapter implements RuntimeAdapter {
	async spawn(command: string, args: string[], cwd?: string): Promise<SpawnResult> {
		const { spawn } = await import("node:child_process");
		return new Promise((resolve) => {
			const proc = spawn(command, args, {
				stdio: ["ignore", "pipe", "pipe"],
				...(cwd ? { cwd } : {}),
			});
			let stdout = "";
			let stderr = "";

			proc.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			proc.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			proc.on("close", (exitCode) => {
				resolve({
					success: exitCode === 0,
					stdout,
					stderr,
					exitCode,
				});
			});

			proc.on("error", (error) => {
				resolve({
					success: false,
					stdout: "",
					stderr: error.message,
					exitCode: -1,
				});
			});
		});
	}

	async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async readFile(path: string): Promise<string> {
		const { readFile } = await import("node:fs/promises");
		return readFile(path, "utf-8");
	}

	cwd(): string {
		return process.cwd();
	}
}

/** ランタイムアダプターのファクトリー */
export function createRuntimeAdapter(): RuntimeAdapter {
	// Bunの場合はBunRuntimeAdapterを使用
	if (typeof Bun !== "undefined") {
		return new BunRuntimeAdapter();
	}
	// それ以外はNode.js互換
	return new NodeRuntimeAdapter();
}
