---
name: link-crawler
description: 技術ドキュメントサイトをクロールし、AIコンテキスト用のMarkdownとして保存する
mode: template
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

# 🕷️ link-crawler — ドキュメントクロール

**{{url}}** を深度 **{{depth}}** でクロールし、`{{output}}` に保存します。

```bash
bash {{__skill_dir__}}/run.sh "{{url}}" "{{depth}}" "{{output}}" "{{diff}}" "{{max_pages}}" "{{include}}" "{{exclude}}" "{{same_domain}}"
```
