# taskp-link-crawler

技術ドキュメントサイトをクロールし、AIコンテキスト用のMarkdownとして保存するCLIツール & [taskp](https://github.com/takemo101/taskp) スキル。

## インストール

### crawl コマンドのインストール

Bun でグローバルインストールします。

```bash
bun add -g github:takemo101/taskp-link-crawler
```

インストール後、`crawl` コマンドが使えるようになります。

```bash
crawl --version
crawl --help
```

### 前提条件

- **Bun >= 1.2.0**（必須）
- **playwright-cli**（cli fetcher 用）: `npm install -g @playwright/cli`
- **playwright**（native fetcher 用）: `bun add -g playwright` + `npx playwright install chromium`
- **uv / uvx**（推奨）: MarkItDown 変換で使用。なくても Turndown にフォールバック

### taskp スキルとして使う場合

[taskp](https://github.com/takemo101/taskp) がインストール済みの環境で、スキルディレクトリをシンボリックリンクします。

```bash
# リポジトリをクローン
git clone https://github.com/takemo101/taskp-link-crawler.git
cd taskp-link-crawler

# .agents/skills/link-crawler/ を taskp のスキルディレクトリにリンク
ln -sf "$(pwd)/.agents/skills/link-crawler" ~/.taskp/skills/link-crawler
```

登録後は taskp から実行できます。

```bash
# インタラクティブ実行
taskp run link-crawler

# ワンライナー
taskp run link-crawler \
  --set url=https://nextjs.org/docs \
  --set depth=2 \
  --set output=.context/nextjs

# TUI から選択
taskp tui
```

## 使い方

### 基本

```bash
crawl https://example.com/docs -d 2 -o .context/example
```

### オプション一覧

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `-d, --depth <num>` | 最大クロール深度 | `1` |
| `--max-pages <num>` | 最大ページ数（0=無制限） | `0` |
| `-o, --output <dir>` | 出力ディレクトリ | `.context/<site-name>/` |
| `--same-domain` / `--no-same-domain` | 同一ドメインのみ | `true` |
| `--include <pattern>` | 含めるURLパターン（正規表現） | - |
| `--exclude <pattern>` | 除外するURLパターン（正規表現） | - |
| `--delay <ms>` | リクエスト間隔 | `500` |
| `--timeout <sec>` | リクエストタイムアウト | `30` |
| `--wait <ms>` | SPA レンダリング待機時間 | `2000` |
| `--fetcher <type>` | `cli`（軽量）または `native`（Cloudflare対応） | `cli` |
| `--diff` | 差分クロール（変更ページのみ更新） | `false` |
| `--headed` | ブラウザウィンドウを表示 | `false` |
| `--no-pages` | 個別ページファイルをスキップ | - |
| `--no-merge` | 結合ファイル（full.md）をスキップ | - |
| `--chunks` | チャンク分割を有効化 | `false` |
| `--no-robots` | robots.txt を無視 | - |

### Fetcher の選び方

| Fetcher | 用途 | 特徴 |
|---------|------|------|
| `cli`（デフォルト） | 一般的なサイト | 軽量・高速。playwright-cli を使用 |
| `native` | Cloudflare / SPA 保護サイト | Bot検出回避（UA偽装, webdriver隠蔽）。要 playwright + Chromium |

### 使用例

```bash
# 基本的なドキュメントクロール
crawl https://docs.example.com -d 3 -o .context/example

# Cloudflare 保護サイト（Notion 等）
crawl https://example.notion.site/docs \
  -d 2 --fetcher native --wait 8000 --timeout 60

# 差分クロール（2回目以降を高速化）
crawl https://docs.example.com -d 3 --diff

# 特定パスのみクロール
crawl https://example.com/docs \
  -d 5 --include "/docs/api/"
```

## Markdown 変換方式

- デフォルト: **MarkItDown**（Microsoft製、高品質）
- フォールバック: **Turndown**（軽量、コードブロック特化）

MarkItDown は Python ワーカープロセスとして常駐し、ページ変換を効率的に処理します。以下の場合は自動的に Turndown にフォールバックします:

- Syntax highlighter 系コードブロック（`hljs`, `shiki`, `torchlight` 等）を含む HTML
- MarkItDown ワーカーの起動失敗 / 変換エラー / タイムアウト

`DEBUG=1` でフォールバック理由を確認できます。

## 開発

```bash
# ローカル実行
bun run dev https://example.com

# テスト
bun run test

# lint & format
bun run check

# 型チェック
bun run typecheck

# ビルド（Node.js 向け配布用）
bun run build
```

## ファイル構成

```
taskp-link-crawler/
├── .agents/skills/link-crawler/  ← taskp スキル（SKILL.md + run.sh）
├── src/
│   ├── crawl.ts                  ← CLI エントリーポイント
│   ├── config.ts                 ← 設定パース
│   ├── crawler/                  ← クロールエンジン
│   │   ├── index.ts              ← メイン Crawler クラス
│   │   ├── fetcher.ts            ← playwright-cli fetcher
│   │   ├── fetcher-native.ts     ← playwright native fetcher
│   │   ├── logger.ts             ← ログ出力
│   │   ├── robots.ts             ← robots.txt パーサー
│   │   └── post-processor.ts     ← Merger/Chunker 実行
│   ├── parser/                   ← HTML → Markdown 変換
│   │   ├── converter.ts          ← MarkItDown + Turndown
│   │   ├── extractor.ts          ← コンテンツ抽出
│   │   └── links.ts              ← リンク抽出
│   ├── output/                   ← ファイル出力
│   ├── diff/                     ← 差分クロール
│   └── utils/
├── tests/                        ← テストスイート（30ファイル, 897テスト）
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── biome.json
```
