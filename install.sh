#!/usr/bin/env bash
set -euo pipefail

echo "🔧 link-crawler インストールスクリプト"
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 成功メッセージ
ok() {
    echo -e "${GREEN}✓${NC} $1"
}

# 警告メッセージ
warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# エラーメッセージ
error() {
    echo -e "${RED}✗${NC} $1"
}

# スクリプトのディレクトリに移動
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📍 インストール先: $SCRIPT_DIR"
echo ""

# 1. Bun のチェック
echo "1️⃣  Bun のチェック..."
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    ok "Bun $BUN_VERSION がインストール済み"
else
    error "Bun がインストールされていません"
    echo "   インストール方法: curl -fsSL https://bun.sh/install | bash"
    echo "   または: brew install oven-sh/bun/bun"
    exit 1
fi
echo ""

# 2. Node.js のチェック（playwright-cli に必要）
echo "2️⃣  Node.js のチェック..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    ok "Node.js $NODE_VERSION がインストール済み"
else
    error "Node.js がインストールされていません"
    echo "   インストール方法: brew install node"
    exit 1
fi
echo ""

# 3. playwright-cli のインストール
echo "3️⃣  playwright-cli のチェック..."
if command -v playwright-cli &> /dev/null; then
    if PLAYWRIGHT_VERSION=$(playwright-cli --version 2>&1); then
        ok "playwright-cli ${PLAYWRIGHT_VERSION} がインストール済み"
    else
        warn "playwright-cli のバージョン取得に失敗しましたが、コマンドは存在します"
    fi
else
    warn "playwright-cli がインストールされていません。インストール中..."
    npm install -g @playwright/cli
    if command -v playwright-cli &> /dev/null; then
        ok "playwright-cli のインストール完了"
    else
        error "playwright-cli のインストールに失敗しました"
        echo "   手動でインストール: npm install -g @playwright/cli"
        exit 1
    fi
fi
echo ""

# 4. プロジェクト依存関係のインストール
echo "4️⃣  プロジェクト依存関係のインストール..."
if [ -f "bun.lock" ] || [ -f "package.json" ]; then
    bun install
    ok "依存関係のインストール完了"
else
    error "package.json が見つかりません"
    exit 1
fi
echo ""

# 5. 動作確認
echo "5️⃣  動作確認..."
if bun run src/crawl.ts --help &> /dev/null; then
    ok "link-crawler の動作確認完了"
else
    warn "動作確認でエラーが発生しましたが、インストールは完了しています"
fi
echo ""

# 完了メッセージ
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ インストール完了！${NC}"
echo ""
echo "使用方法:"
echo "  bun run src/crawl.ts <URL> [オプション]"
echo ""
echo "例:"
echo "  bun run src/crawl.ts https://docs.example.com -d 2"
echo ""
echo "piスキルとして登録:"
echo "  ln -s $SCRIPT_DIR ~/.pi/agent/skills/link-crawler"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
