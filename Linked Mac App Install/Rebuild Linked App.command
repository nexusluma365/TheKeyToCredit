#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
./scripts/rebuild-linked-mac-app.sh
