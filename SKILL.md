---
name: link-crawler
description: 技術ドキュメントサイトをクロールし、AIが参照しやすい形に整理する
mode: template
timeout: 600000
actions:
  crawl:
    description: Webサイトをクロールしてドキュメントを取得する
    mode: template
    timeout: 600000
    inputs:
      - name: url
        type: text
        message: "クロール開始URLは？"
        validate: "^https?://"
      - name: depth
        type: number
        message: "最大クロール深度は？（1〜10）"
        default: 2
      - name: output
        type: text
        message: "出力ディレクトリは？（絶対パスまたは相対パス）"
        default: ".context/docs"
      - name: diff
        type: confirm
        message: "差分クロールを使いますか？（既存結果がある場合に効率的）"
        default: false
      - name: max_pages
        type: number
        message: "最大ページ数は？（0=無制限、上限10000）"
        default: 0
        required: false
      - name: include
        type: text
        message: "含めるURLパターンは？（正規表現、空欄で全て）"
        default: ""
        required: false
      - name: exclude
        type: text
        message: "除外するURLパターンは？（正規表現、空欄でなし）"
        default: ""
        required: false
      - name: same_domain
        type: confirm
        message: "同一ドメインのみクロールしますか？"
        default: true
  organize:
    description: クロール済みドキュメントをAIで整理・分割する
    mode: agent
    tools:
      - bash
      - read
      - write
      - glob
    inputs:
      - name: input_dir
        type: text
        message: "クロール済みディレクトリは？（index.jsonがある場所）"
        default: ".context/docs"
  pipeline:
    description: クロール→AI整理を一括実行する
    mode: template
    timeout: 900000
    inputs:
      - name: url
        type: text
        message: "クロール開始URLは？"
        validate: "^https?://"
      - name: depth
        type: number
        message: "最大クロール深度は？（1〜10）"
        default: 2
      - name: output
        type: text
        message: "出力ディレクトリは？（絶対パスまたは相対パス）"
        default: ".context/docs"
      - name: diff
        type: confirm
        message: "差分クロールを使いますか？（既存結果がある場合に効率的）"
        default: false
      - name: max_pages
        type: number
        message: "最大ページ数は？（0=無制限、上限10000）"
        default: 0
        required: false
      - name: include
        type: text
        message: "含めるURLパターンは？（正規表現、空欄で全て）"
        default: ""
        required: false
      - name: exclude
        type: text
        message: "除外するURLパターンは？（正規表現、空欄でなし）"
        default: ""
        required: false
      - name: same_domain
        type: confirm
        message: "同一ドメインのみクロールしますか？"
        default: true
---

# 🕷️ link-crawler — ドキュメントクロール & AI整理

技術ドキュメントサイトをクロールし、AIが参照しやすい構造化されたMarkdownに変換します。

## action:crawl

**{{url}}** を深度 **{{depth}}** でクロールし、`{{output}}` に保存します。

```bash
bash {{__skill_dir__}}/run.sh "{{url}}" "{{depth}}" "{{output}}" "{{diff}}" "{{max_pages}}" "{{include}}" "{{exclude}}" "{{same_domain}}"
```

## action:organize

あなたはドキュメント整理のエキスパートです。
クロール済みのドキュメントを、AIエージェントが参照しやすい構造に再編成してください。

### 入力

クロール済みディレクトリ: `{{input_dir}}`

このディレクトリには以下が含まれます:
- `index.json` — クロール結果のメタデータ（ページ一覧、URL、タイトル）
- `pages/` — 個別ページのMarkdownファイル（frontmatter付き）
- `full.md` — 全ページ結合ファイル（参考用）

### タスク

#### Step 1: 現状の把握

1. `{{input_dir}}/index.json` を読み込み、ページ一覧を把握する
2. `{{input_dir}}/pages/` 配下の各Markdownファイルの内容を確認する
3. ドキュメント全体の構造（トピック、カテゴリ、関連性）を分析する

#### Step 2: 不要な要素の除去

各ページから以下を除去してください:
- **ナビゲーション要素**: サイドバー、パンくずリスト、メニュー、ページネーション（「次へ」「前へ」リンク）
- **フッター**: コピーライト、サイトリンク集、免責事項
- **広告・バナー**: プロモーション、CTA（Call to Action）
- **frontmatter**: クローラが付けた `---` で囲まれたYAMLメタデータ
- **装飾的な要素**: アイコンのみの行、空リンク、画像のプレースホルダー

ただし以下は保持してください:
- コードブロックとその説明
- API仕様・パラメータ説明
- 実際のコンテンツ内のリンク（外部ドキュメント参照等）
- テーブル、リスト等の構造化された情報

#### Step 3: ドキュメントの構造化

ページ数と内容に応じて適切な構成を選択してください:

**10ページ以下の場合 → フラット構成:**
```
{{input_dir}}/organized/
├── README.md
├── getting-started.md
├── configuration.md
└── api-reference.md
```

**11ページ以上の場合 → ディレクトリ構成:**
```
{{input_dir}}/organized/
├── README.md
├── getting-started/
│   ├── installation.md
│   └── quick-start.md
├── guides/
│   ├── configuration.md
│   └── deployment.md
└── api/
    ├── endpoints.md
    └── authentication.md
```

構造化のルール:
- 関連する内容は1つのファイルにまとめる（意味的なまとまり）
- 1ファイルは **500〜3000行** を目安とする（AIのコンテキストウィンドウに収まるサイズ）
- ファイル名は英語のkebab-case（例: `getting-started.md`）
- 各ファイルの先頭には明確な `# タイトル` を付ける

#### Step 4: README.md の生成

`{{input_dir}}/organized/README.md` を以下の構成で作成してください:

```markdown
# [ドキュメントタイトル]

> Source: [元サイトのURL]
> Crawled: [クロール日時]（index.jsonのcrawledAtから取得）
> Pages: [元ページ数] → [整理後ファイル数]

## 概要

[ドキュメント全体の概要を2〜5文で要約]

## ドキュメント一覧

| ファイル | 説明 |
|---------|------|
| [getting-started.md](getting-started.md) | セットアップと基本的な使い方 |
| [configuration.md](configuration.md) | 設定オプションの詳細 |
| ... | ... |
```

### 注意事項

- 元のクロールデータ（`pages/`, `index.json`, `full.md`）は変更・削除しないこと
- 出力先は `{{input_dir}}/organized/` ディレクトリ
- 整理前に `organized/` ディレクトリが既に存在する場合は、中身を削除してから再作成する
- 内容の正確性を維持すること（要約ではなく再構成）

## action:pipeline

**{{url}}** をクロールし、その後AIで整理します。

```bash
bash {{__skill_dir__}}/run.sh "{{url}}" "{{depth}}" "{{output}}" "{{diff}}" "{{max_pages}}" "{{include}}" "{{exclude}}" "{{same_domain}}"
```

```bash
taskp run link-crawler:organize --skip-prompt --set input_dir="{{output}}"
```
