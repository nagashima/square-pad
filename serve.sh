#!/bin/bash
# Square 開発用ローカルサーバー
# Usage:
#   ./serve.sh          # ポート 8000 で起動
#   ./serve.sh 8080     # ポート指定
set -e

PORT="${1:-8000}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 が見つかりません" >&2
  exit 1
fi

echo "Square dev server"
echo "  URL:  http://localhost:${PORT}/"
echo "  Stop: Ctrl+C"
echo ""
python3 -m http.server "${PORT}"
