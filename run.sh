#!/usr/bin/env bash
set -euo pipefail

# link-crawler wrapper for taskp
# Usage: run.sh <url> <depth> <output> <diff> [max_pages] [include] [exclude] [same_domain]

# このスクリプト自身のディレクトリ（シンボリックリンク解決済み）
CRAWLER_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

url="$1"
depth="$2"
output="$3"
diff="$4"
max_pages="${5:-}"
include="${6:-}"
exclude="${7:-}"
same_domain="${8:-true}"

# Build command
cmd=(bun run "${CRAWLER_DIR}/src/crawl.ts" "$url" -d "$depth" -o "$output")

# Optional flags
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

echo "🕷️  link-crawler 実行:"
echo "  ${cmd[*]}"
echo ""

exec "${cmd[@]}"
