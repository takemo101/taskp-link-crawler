#!/usr/bin/env bash
set -euo pipefail

# link-crawler wrapper for taskp
# Usage: run.sh <url> <depth> <output> <diff> [max_pages] [include] [exclude] [same_domain] [wait] [timeout] [fetcher]

url="$1"
depth="$2"
output="$3"
diff="$4"
max_pages="${5:-}"
include="${6:-}"
exclude="${7:-}"
same_domain="${8:-true}"
wait="${9:-}"
timeout="${10:-}"
fetcher="${11:-cli}"

# --- crawl コマンドのパス解決 ---
# crawl は bun add -g でグローバルインストールされた CLI。
# taskp (execa) はインタラクティブシェルではないため .zshrc 等が読み込まれず
# PATH に存在しない場合がある。既知のインストール先を探索する。
resolve_crawl() {
  if command -v crawl &> /dev/null; then
    echo "crawl"
    return
  fi

  local candidates=(
    "${HOME}/.bun/bin/crawl"
    "/opt/homebrew/bin/crawl"
    "/usr/local/bin/crawl"
  )

  # nvm 管理下
  if [[ -n "${NVM_BIN:-}" ]]; then
    candidates=("${NVM_BIN}/crawl" "${candidates[@]}")
  fi

  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  echo "エラー: crawl コマンドが見つかりません" >&2
  echo "  インストール: bun add -g github:takemo101/taskp-link-crawler" >&2
  exit 1
}

CRAWL="$(resolve_crawl)"

# Build command
cmd=("$CRAWL" "$url" -d "$depth" -o "$output")

if [[ "$diff" == "true" ]]; then
  cmd+=(--diff)
fi

if [[ -n "$max_pages" && "$max_pages" != "0" ]]; then
  cmd+=(--max-pages "$max_pages")
fi

if [[ -n "$include" ]]; then
  cmd+=(--include "$include")
fi

if [[ -n "$exclude" ]]; then
  cmd+=(--exclude "$exclude")
fi

if [[ "$same_domain" == "false" ]]; then
  cmd+=(--no-same-domain)
fi

if [[ -n "$wait" && "$wait" != "0" ]]; then
  cmd+=(--wait "$wait")
fi

if [[ -n "$timeout" && "$timeout" != "0" ]]; then
  cmd+=(--timeout "$timeout")
fi

if [[ "$fetcher" == "native" ]]; then
  cmd+=(--fetcher native)
fi

echo "🕷️  link-crawler 実行:"
echo "  ${cmd[*]}"
echo ""

exec "${cmd[@]}"
