#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if lsof -ti tcp:4001 >/dev/null 2>&1; then
  echo "Credit Analyzer USB Key appears to be running on port 4001."
  echo "Quit the app, then run this rebuild again."
  exit 1
fi

env -u ELECTRON_RUN_AS_NODE npm run mac:build

APP_LINK="/Applications/Credit Analyzer USB Key.app"
APP_TARGET="$ROOT_DIR/dist/mac/Credit Analyzer USB Key.app"

if [ ! -L "$APP_LINK" ]; then
  echo "Creating /Applications linked app..."
  ln -s "$APP_TARGET" "$APP_LINK"
fi

echo "Linked Mac app rebuilt:"
echo "$APP_TARGET"
echo
echo "/Applications link:"
readlink "$APP_LINK" || true
