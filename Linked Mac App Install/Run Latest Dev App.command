#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
env -u ELECTRON_RUN_AS_NODE npm run mac:dev
