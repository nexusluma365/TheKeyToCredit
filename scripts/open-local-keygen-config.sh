#!/bin/zsh
set -euo pipefail

CONFIG_DIR="$HOME/Library/Application Support/Credit Analyzer USB Key"
CONFIG_FILE="$CONFIG_DIR/.env"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'ENV'
KEYGEN_ACCOUNT_ID=
KEYGEN_POLICY_ID=
KEYGEN_API_TOKEN=
APP_VERSION=1.0.0
ENV
fi

echo "Local Keygen config:"
echo "$CONFIG_FILE"

open -a TextEdit "$CONFIG_FILE"
