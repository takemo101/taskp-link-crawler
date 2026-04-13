# taskp-link-crawler

技術ドキュメントサイトをクロールし、AIコンテキスト用のMarkdownとして保存する [taskp](../task-preset) スキル。

[dict-skills/link-crawler](../dict-skills) をベースに独立プロジェクト化したもの。

## セットアップ

### 1. 依存関係のインストール

```bash
cd ~/Desktop/ai/taskp-link-crawler
bun install
```

または:

```bash
./install.sh
```

### 2. taskp グローバルスキルとして登録

```bash
# .agents/skills/link-crawler/ ディレクトリをシンボリックリンク
ln -sf ~/Desktop/ai/taskp-link-crawler/.agents/skills/link-crawler ~/.taskp/skills/link-crawler
```

### 前提条件

- Bun >= 1.2.0
- `uv` / `uvx`（推奨。デフォルトの MarkItDown 変換で使用）
- playwright-cli (`npm install -g @playwright/cli`)
- [taskp](../task-preset) がインストール済み

> HTML → Markdown 変換はデフォルトで [Microsoft MarkItDown](https://github.com/microsoft/markitdown) を使用します。初回変換時に MarkItDown の常駐ワーカープロセスを起動し、以降のページ変換で再利用します。`uvx` や Python 上の `markitdown` が使えない環境、または変換に失敗した場合は、既存の Turndown ベース変換へ自動フォールバックします。

## 使い方

### taskp 経由（推奨）

```bash
# インタラクティブ実行（どのプロジェクトからでも）
taskp run link-crawler

# ワンライナー
taskp run link-crawler \
  --set url=https://nextjs.org/docs \
  --set depth=2 \
  --set output=.context/nextjs

# TUI から選択
taskp tui
```

### 直接実行

```bash
cd ~/Desktop/ai/taskp-link-crawler
bun run src/crawl.ts https://example.com/docs -d 2 -o .context/example
```

### Notion 公開ページをクロールする例

Notion は JavaScript 描画が多いため、`native` fetcher と少し長めの待機時間を推奨します。

```bash
crawl "https://uniikey.notion.site/support" \
  -d 2 \
  --fetcher native \
  --wait 5000 \
  -o /Users/lm_117_t.kawasaki/Desktop/workspace/contexts/.context/uniikey
```

より安定性を重視する場合はタイムアウトも延ばしてください。

```bash
crawl "https://uniikey.notion.site/support" \
  -d 2 \
  --fetcher native \
  --wait 8000 \
  --timeout 60 \
  -o /Users/lm_117_t.kawasaki/Desktop/workspace/contexts/.context/uniikey
```

出力後の確認例:

```bash
ls /Users/lm_117_t.kawasaki/Desktop/workspace/contexts/.context/uniikey
sed -n '1,120p' /Users/lm_117_t.kawasaki/Desktop/workspace/contexts/.context/uniikey/full.md
```

## 開発

```bash
# テスト
bun run test

# lint & format
bun run check

# 型チェック
bun run typecheck
```

## Markdown 変換方式

- デフォルト: **MarkItDown**
- フォールバック: **Turndown**

通常の HTML はまず MarkItDown で変換します。毎ページごとに新しい CLI を起動するのではなく、初回に起動した MarkItDown ワーカーを使い回すため、変換品質を上げつつオーバーヘッドを抑えています。

以下のケースでは内部的に Turndown を使用します。

- Syntax highlighter 系の特殊なコードブロック（`hljs`, `shiki`, `torchlight`, `data-rehype-pretty-code-*` など）を含む HTML
- MarkItDown ワーカーの起動に失敗した場合
- MarkItDown 変換がエラーまたはタイムアウトした場合

`DEBUG=1` を付けて実行すると、MarkItDown から Turndown へフォールバックした理由をデバッグログで確認できます。

## ファイル構成

```
taskp-link-crawler/
├── SKILL.md           ← taskp スキル定義
├── run.sh             ← CLI オプション組み立てラッパー
├── src/               ← クローラー本体
│   ├── crawl.ts       ← CLI エントリーポイント
│   ├── config.ts
│   ├── crawler/       ← クロールエンジン
│   ├── parser/        ← HTML → Markdown 変換
│   ├── output/        ← ファイル出力
│   ├── diff/          ← 差分クロール
│   └── utils/
├── tests/             ← テストスイート
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── biome.json
```
