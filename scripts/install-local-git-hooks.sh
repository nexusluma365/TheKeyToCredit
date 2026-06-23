#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d .git ]; then
  echo "This folder is not a Git repository yet. Run git init first."
  exit 1
fi

mkdir -p .git/hooks

cat > .git/hooks/post-commit <<'HOOK'
#!/bin/zsh
set -e
ROOT_DIR="$(git rev-parse --show-toplevel)"
"$ROOT_DIR/scripts/rebuild-linked-mac-app.sh"
HOOK

cat > .git/hooks/post-merge <<'HOOK'
#!/bin/zsh
set -e
ROOT_DIR="$(git rev-parse --show-toplevel)"
"$ROOT_DIR/scripts/rebuild-linked-mac-app.sh"
HOOK

chmod +x .git/hooks/post-commit .git/hooks/post-merge

echo "Installed local Git hooks:"
echo "- post-commit: rebuilds linked Mac app after local commits"
echo "- post-merge: rebuilds linked Mac app after git pull merges"
