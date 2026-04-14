import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const MARKITDOWN_TIMEOUT_MS = 30_000;
const MARKITDOWN_RUNNERS = [
	{ command: "python3", args: ["-u", "-c", buildMarkItDownWorkerScript()] },
	{ command: "python", args: ["-u", "-c", buildMarkItDownWorkerScript()] },
] as const;
const unavailableMarkItDownCommands = new Set<string>();
const TURNDOWN_PREFERRED_PATTERNS = [
	/data-rehype-pretty-code-fragment/i,
	/data-rehype-pretty-code-figure/i,
	/data-language\s*=|data-lang\s*=/i,
	/class\s*=\s*["'][^"']*\b(?:hljs|prism-code|shiki|highlight|code-block|torchlight)\b/i,
	/class\s*=\s*["'][^"']*\b(?:language-|lang-)\w+/i,
] as const;

interface MarkItDownResponse {
	id: number;
	ok: boolean;
	markdown?: string;
	error?: string;
}

interface MarkItDownReadyMessage {
	ready: true;
}

interface PendingRequest {
	resolve: (value: string | null) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

class MarkItDownWorker {
	private pending = new Map<number, PendingRequest>();
	private nextId = 1;
	private buffer = "";
	private disposed = false;
	private exited = false;

	constructor(private child: ChildProcessWithoutNullStreams) {
		// unref() でイベントループから切り離し、メイン処理完了時にプロセスが終了できるようにする
		if (typeof child.unref === "function") child.unref();
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			if (process.env.DEBUG === "1") {
				console.warn(`[DEBUG markitdown stderr] ${chunk.trim()}`);
			}
		});
		child.once("error", (error) =>
			this.failAll(error instanceof Error ? error : new Error(String(error))),
		);
		child.once("exit", (code, signal) => {
			this.exited = true;
			if (this.disposed) return;
			this.failAll(
				new Error(`MarkItDown worker exited unexpectedly (code=${code}, signal=${signal})`),
			);
		});
	}

	async convert(html: string): Promise<string | null> {
		if (this.disposed || this.exited) {
			throw new Error("MarkItDown worker is not available");
		}

		const id = this.nextId++;
		const payload = `${JSON.stringify({ id, html: Buffer.from(html, "utf8").toString("base64") })}\n`;

		return await new Promise<string | null>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MarkItDown worker timed out after ${MARKITDOWN_TIMEOUT_MS}ms`));
			}, MARKITDOWN_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timeout });

			this.child.stdin.write(payload, "utf8", (error) => {
				if (!error) return;
				clearTimeout(timeout);
				this.pending.delete(id);
				reject(error instanceof Error ? error : new Error(String(error)));
			});
		});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const request of this.pending.values()) {
			clearTimeout(request.timeout);
			request.reject(new Error("MarkItDown worker disposed"));
		}
		this.pending.clear();
		// ストリームのリスナーを除去してイベントループを解放
		this.child.stdout.removeAllListeners();
		this.child.stderr.removeAllListeners();
		this.child.stdin.end();
		if (!this.exited) {
			this.child.kill();
		}
	}

	private handleStdout(chunk: string): void {
		this.buffer += chunk;
		let newlineIndex = this.buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = this.buffer.slice(0, newlineIndex).trim();
			this.buffer = this.buffer.slice(newlineIndex + 1);
			if (line) {
				this.handleResponseLine(line);
			}
			newlineIndex = this.buffer.indexOf("\n");
		}
	}

	private handleResponseLine(line: string): void {
		let response: MarkItDownResponse | MarkItDownReadyMessage;
		try {
			response = JSON.parse(line) as MarkItDownResponse | MarkItDownReadyMessage;
		} catch (error) {
			this.failAll(error instanceof Error ? error : new Error(String(error)));
			return;
		}

		if ("ready" in response) {
			return;
		}

		const request = this.pending.get(response.id);
		if (!request) return;
		clearTimeout(request.timeout);
		this.pending.delete(response.id);
		if (response.ok) {
			request.resolve(response.markdown ?? "");
			return;
		}
		request.reject(new Error(response.error ?? "Unknown MarkItDown conversion error"));
	}

	private failAll(error: Error): void {
		for (const request of this.pending.values()) {
			clearTimeout(request.timeout);
			request.reject(error);
		}
		this.pending.clear();
	}
}

let markItDownWorkerPromise: Promise<MarkItDownWorker | null> | null = null;
let exitHandlerRegistered = false;

/** 言語を検出するためのクラス名パターン（優先順位順） */
const LANGUAGE_CLASS_PATTERNS = [/language-(\w+)/, /lang-(\w+)/];

function buildMarkItDownWorkerScript(): string {
	return [
		"import base64",
		"import io",
		"import json",
		"import sys",
		"from markitdown import MarkItDown",
		"converter = MarkItDown()",
		"sys.stdout.write(json.dumps({'ready': True}) + '\\n')",
		"sys.stdout.flush()",
		"for raw_line in sys.stdin:",
		"    line = raw_line.strip()",
		"    if not line:",
		"        continue",
		"    request = json.loads(line)",
		"    request_id = request['id']",
		"    try:",
		"        html = base64.b64decode(request['html'])",
		"        result = converter.convert_stream(stream=io.BytesIO(html), file_extension='.html')",
		"        markdown = getattr(result, 'text_content', None)",
		"        if markdown is None:",
		"            markdown = getattr(result, 'markdown', '')",
		"        sys.stdout.write(json.dumps({'id': request_id, 'ok': True, 'markdown': markdown}) + '\\n')",
		"        sys.stdout.flush()",
		"    except Exception as error:",
		"        sys.stdout.write(json.dumps({'id': request_id, 'ok': False, 'error': str(error)}) + '\\n')",
		"        sys.stdout.flush()",
	].join("\n");
}

/** 要素から言語を検出 */
function detectLanguage(el: Element): string | null {
	const dataLanguage = el.getAttribute("data-language") || el.getAttribute("data-lang");
	if (dataLanguage) return dataLanguage;

	const preEl = el.querySelector("pre[data-language]");
	if (preEl) {
		const preLang = preEl.getAttribute("data-language");
		if (preLang) return preLang;
	}

	const className = el.className;
	if (className) {
		for (const pattern of LANGUAGE_CLASS_PATTERNS) {
			const match = className.match(pattern);
			if (match?.[1]) {
				return match[1];
			}
		}
	}

	const codeEl = el.querySelector("code");
	if (codeEl) {
		const codeClass = codeEl.className;
		if (codeClass) {
			for (const pattern of LANGUAGE_CLASS_PATTERNS) {
				const match = codeClass.match(pattern);
				if (match?.[1]) {
					return match[1];
				}
			}
		}
	}

	return null;
}

/** HTML を Markdown に変換 */
export async function htmlToMarkdown(html: string): Promise<string> {
	if (!html.trim()) {
		return "";
	}

	if (shouldPreferTurndown(html)) {
		return convertWithTurndown(html);
	}

	if (shouldDisableMarkItDownInCurrentProcess()) {
		return convertWithTurndown(html);
	}

	const markItDownMarkdown = await convertWithMarkItDown(html);
	if (markItDownMarkdown) {
		return markItDownMarkdown;
	}

	return convertWithTurndown(html);
}

async function convertWithMarkItDown(html: string): Promise<string | null> {
	const worker = await getMarkItDownWorker();
	if (!worker) {
		logMarkItDownDebug("worker unavailable; falling back to Turndown");
		return null;
	}

	try {
		const normalized = normalizeMarkdown((await worker.convert(html)) ?? "");
		return normalized || null;
	} catch (error) {
		logMarkItDownDebug("conversion failed; falling back to Turndown", error);
		return null;
	}
}

async function getMarkItDownWorker(): Promise<MarkItDownWorker | null> {
	if (!markItDownWorkerPromise) {
		markItDownWorkerPromise = createMarkItDownWorker();
	}
	return await markItDownWorkerPromise;
}

async function createMarkItDownWorker(): Promise<MarkItDownWorker | null> {
	for (const runner of MARKITDOWN_RUNNERS) {
		if (unavailableMarkItDownCommands.has(runner.command)) {
			continue;
		}

		const worker = await tryStartMarkItDownWorker(runner.command, runner.args);
		if (worker) {
			registerExitHandler(worker);
			return worker;
		}
	}
	return null;
}

const MARKITDOWN_STARTUP_TIMEOUT_MS = 30_000;

async function tryStartMarkItDownWorker(
	command: string,
	args: readonly string[],
): Promise<MarkItDownWorker | null> {
	return await new Promise<MarkItDownWorker | null>((resolve) => {
		const child = spawn(command, [...args], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		let stdoutBuffer = "";
		let stderrBuffer = "";
		let resolved = false;

		const startupTimeout = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			cleanup();
			logMarkItDownDebug(
				`worker startup timed out via ${command} (${MARKITDOWN_STARTUP_TIMEOUT_MS}ms)`,
			);
			child.kill();
			resolve(null);
		}, MARKITDOWN_STARTUP_TIMEOUT_MS);

		const cleanup = () => {
			clearTimeout(startupTimeout);
			child.removeListener("spawn", handleSpawn);
			child.removeListener("error", handleError);
			child.removeListener("exit", handleExit);
			child.stdout.removeListener("data", handleStdout);
			child.stderr.removeListener("data", handleStderr);
		};

		const handleSpawn = () => {
			// wait for ready handshake
		};

		const handleStdout = (chunk: string) => {
			stdoutBuffer += chunk;
			const newlineIndex = stdoutBuffer.indexOf("\n");
			if (newlineIndex === -1) return;
			const line = stdoutBuffer.slice(0, newlineIndex).trim();
			stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
			let isReady = false;
			try {
				const msg = JSON.parse(line);
				isReady = msg.ready === true;
			} catch {
				// JSON パース失敗は無視
			}
			if (isReady) {
				if (resolved) return;
				resolved = true;
				cleanup();
				resolve(new MarkItDownWorker(child));
			}
		};

		const handleStderr = (chunk: string) => {
			stderrBuffer += chunk;
		};

		const handleError = (error: Error) => {
			if (resolved) return;
			resolved = true;
			cleanup();
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				unavailableMarkItDownCommands.add(command);
			}
			logMarkItDownDebug(`failed to start worker via ${command}`, error);
			resolve(null);
		};

		const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
			if (resolved) return;
			resolved = true;
			cleanup();
			logMarkItDownDebug(
				`worker exited before ready via ${command} (code=${code}, signal=${signal})`,
				stderrBuffer || stdoutBuffer,
			);
			resolve(null);
		};

		child.once("spawn", handleSpawn);
		child.once("error", handleError);
		child.once("exit", handleExit);
		child.stdout.on("data", handleStdout);
		child.stderr.on("data", handleStderr);
	});
}

function registerExitHandler(worker: MarkItDownWorker): void {
	if (exitHandlerRegistered) return;
	// beforeExit: イベントループが空になったときに発火（exit より前）
	process.once("beforeExit", () => worker.dispose());
	process.once("exit", () => worker.dispose());
	exitHandlerRegistered = true;
}

function convertWithTurndown(html: string): string {
	const turndown = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
	});

	turndown.use(gfm);

	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});

	turndown.addRule("syntaxHighlighter", {
		filter: (node) => {
			return (
				node.nodeName === "DIV" &&
				(node.hasAttribute("data-rehype-pretty-code-fragment") ||
					node.classList.contains("hljs") ||
					node.classList.contains("prism-code") ||
					node.classList.contains("shiki") ||
					node.classList.contains("highlight") ||
					node.classList.contains("code-block"))
			);
		},
		replacement: (_content, node) => {
			const language = detectLanguage(node as Element);
			const codeContent = extractCodeContent(node as Element);
			const lang = language || "";
			const fence = "```";
			return `\n\n${fence}${lang}\n${codeContent}\n${fence}\n\n`;
		},
	});

	turndown.addRule("torchlight", {
		filter: (node) => {
			if (node.nodeName !== "PRE") return false;
			const code = node.querySelector("code");
			if (!code) return false;
			const cls = code.getAttribute("class") || "";
			return cls.includes("torchlight");
		},
		replacement: (_content, node) => {
			const codeEl = (node as Element).querySelector("code");
			if (!codeEl) return _content;
			const language = detectLanguage(codeEl as Element);
			const codeContent = extractCodeContent(node as Element);
			const lang = language || "";
			const fence = "```";
			return `\n\n${fence}${lang}\n${codeContent}\n${fence}\n\n`;
		},
	});

	turndown.addRule("prettyCodeFigure", {
		filter: (node) => {
			return node.nodeName === "FIGURE" && node.hasAttribute("data-rehype-pretty-code-figure");
		},
		replacement: (_content, node) => {
			const language = detectLanguage(node as Element);
			const codeContent = extractCodeContent(node as Element);
			const lang = language || "";
			const fence = "```";
			return `\n\n${fence}${lang}\n${codeContent}\n${fence}\n\n`;
		},
	});

	return normalizeMarkdown(turndown.turndown(html));
}

function shouldPreferTurndown(html: string): boolean {
	return TURNDOWN_PREFERRED_PATTERNS.some((pattern) => pattern.test(html));
}

function normalizeMarkdown(markdown: string): string {
	return markdown
		.replace(/\[\\\[\s*\\\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function shouldDisableMarkItDownInCurrentProcess(): boolean {
	const isTestProcess = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
	return isTestProcess && process.env.LINK_CRAWLER_ENABLE_MARKITDOWN_IN_TESTS !== "1";
}

function logMarkItDownDebug(message: string, error?: unknown): void {
	if (process.env.DEBUG !== "1") return;
	console.warn(`[DEBUG markitdown] ${message}`);
	if (error) {
		console.warn(error instanceof Error ? error.message : String(error));
	}
}

const LINE_NUMBER_HTML_PATTERNS = [
	/<span[^>]*\bclass\s*=\s*["'][^"']*\bline-number\b[^"']*["'][^>]*>.*?<\/span>/gi,
	/<span[^>]*\bclass\s*=\s*["'][^"']*\blinenumber\b[^"']*["'][^>]*>.*?<\/span>/gi,
	/<span[^>]*\bdata-line-number\s*=\s*["'][^"']*["'][^>]*>.*?<\/span>/gi,
	/<td[^>]*\bclass\s*=\s*["'][^"']*\bhljs-ln-numbers\b[^"']*["'][^>]*>.*?<\/td>/gi,
];

function getTextWithoutLineNumbers(el: Element): string {
	let html = el.innerHTML;
	for (const pattern of LINE_NUMBER_HTML_PATTERNS) {
		html = html.replace(pattern, "");
	}
	html = html.replace(/<\/div>/gi, "\n");
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&nbsp;/g, " ")
		.replace(/\n{2,}/g, "\n")
		.trim();
}

function extractCodeContent(el: Element): string {
	const pre = el.querySelector("pre");
	const target = pre || el.querySelector("code") || el;
	const html = target.innerHTML || "";
	const hasLineNumbers = LINE_NUMBER_HTML_PATTERNS.some((pattern) => {
		pattern.lastIndex = 0;
		return pattern.test(html);
	});

	if (hasLineNumbers) {
		return getTextWithoutLineNumbers(target);
	}

	return target.textContent?.trim() || "";
}

export function resetMarkItDownWorkerForTests(): void {
	void markItDownWorkerPromise?.then((worker) => worker?.dispose());
	markItDownWorkerPromise = null;
	exitHandlerRegistered = false;
	unavailableMarkItDownCommands.clear();
}
