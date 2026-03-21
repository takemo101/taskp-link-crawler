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
# ディレクトリは実体で作り、中のファイルをシンボリックリンク
# （taskp が isDirectory() でスキャンするため、ディレクトリごとのシンボリックリンクは認識されない）
mkdir -p ~/.taskp/skills/link-crawler
ln -sf ~/Desktop/ai/taskp-link-crawler/SKILL.md ~/.taskp/skills/link-crawler/SKILL.md
ln -sf ~/Desktop/ai/taskp-link-crawler/run.sh ~/.taskp/skills/link-crawler/run.sh
```

### 前提条件

- Bun >= 1.2.0
- playwright-cli (`npm install -g @playwright/cli`)
- [taskp](../task-preset) がインストール済み

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

## 開発

```bash
# テスト
bun run test

# lint & format
bun run check

# 型チェック
bun run typecheck
```

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
