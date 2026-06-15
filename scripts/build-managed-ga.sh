#!/usr/bin/env bash
set -euo pipefail

# Build the source-tree managed GA code payload from a local GenericAgent
# checkout. This script copies code only; user state and secrets are excluded.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$HOME/Documents/GenericAgent}"
DEST="$ROOT/managed-ga/code"
STATE_SEED_ROOT="$ROOT/managed-ga/state-seed"
MEMORY_SEED_DEST="$STATE_SEED_ROOT/memory"
EXPECTED_COMMIT="$(python3 - "$ROOT/managed-ga/manifest.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    print(json.load(f)["upstream"]["commit"])
PY
)"
MANAGED_PATCHES=()
while IFS= read -r patch_name; do
  MANAGED_PATCHES+=("$patch_name")
done < <(python3 - "$ROOT/managed-ga/manifest.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    for patch in json.load(f)["patchStack"]["patches"]:
        print(patch)
PY
)

normalize_text_tree() {
  local root="$1"
  find "$root" -type f \( \
    -name '*.py' -o \
    -name '*.js' -o \
    -name '*.json' -o \
    -name '*.md' -o \
    -name '*.txt' -o \
    -name '*.html' -o \
    -name '*.css' -o \
    -name '*.toml' -o \
    -name '*.cmd' -o \
    -name '*.sh' -o \
    -name '*.yml' -o \
    -name '*.yaml' -o \
    -name 'ga' \
  \) -print0 | xargs -0 perl -0pi -e 's/\r\n/\n/g; s/\r/\n/g; s/[ \t]+$//mg; s/\n*\z/\n/'
}

normalize_managed_code_patch_files() {
  local root="$1"
  local files=(
    "README.md"
    "TMWebDriver.py"
    "agentmain.py"
    "ga.py"
    "llmcore.py"
    "frontends/continue_cmd.py"
    "frontends/wechatapp.py"
    "assets/sys_prompt.txt"
    "assets/sys_prompt_en.txt"
    "assets/tools_schema.json"
    "assets/tools_schema_cn.json"
    "assets/tmwd_cdp_bridge/background.js"
    "assets/tmwd_cdp_bridge/content.js"
  )
  for rel in "${files[@]}"; do
    [[ -f "$root/$rel" ]] && perl -0pi -e 's/\r\n/\n/g; s/\r/\n/g; s/[ \t]+$//mg; s/\n*\z/\n/' "$root/$rel"
  done
}

if [[ ! -d "$SOURCE/.git" ]]; then
  echo "Source is not a git checkout: $SOURCE" >&2
  exit 2
fi

ACTUAL_COMMIT="$(git -C "$SOURCE" rev-parse HEAD)"
if [[ "$ACTUAL_COMMIT" != "$EXPECTED_COMMIT" ]]; then
  echo "GenericAgent baseline mismatch:" >&2
  echo "  expected: $EXPECTED_COMMIT" >&2
  echo "  actual:   $ACTUAL_COMMIT" >&2
  echo "Update managed-ga/manifest.json only after a baseline audit." >&2
  exit 2
fi

if [[ -n "$(git -C "$SOURCE" status --porcelain)" ]]; then
  echo "GenericAgent source checkout must be clean before building managed GA." >&2
  echo "Use a clean temporary clone at the audited upstream commit." >&2
  git -C "$SOURCE" status --short >&2
  exit 2
fi

mkdir -p "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 \
  ! -name '.gitignore' \
  ! -name 'README.md' \
  -exec rm -rf {} +

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude '.venv' \
    --exclude 'venv' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'mykey.py' \
    --exclude 'mykey.json' \
    --exclude 'memory' \
    --exclude 'sop' \
    --exclude 'skills' \
    --exclude 'temp' \
    --exclude 'model_responses' \
    "$SOURCE"/ "$DEST"/
else
  (cd "$SOURCE" && tar \
    --exclude './.git' \
    --exclude './.DS_Store' \
    --exclude './.venv' \
    --exclude './venv' \
    --exclude './__pycache__' \
    --exclude './*.pyc' \
    --exclude './mykey.py' \
    --exclude './mykey.json' \
    --exclude './memory' \
    --exclude './sop' \
    --exclude './skills' \
    --exclude './temp' \
    --exclude './model_responses' \
    -cf - .) | (cd "$DEST" && tar -xf -)
fi

# Normalize incidental upstream whitespace and Windows CRLF for files touched by
# the patch stack so patch contexts do not need to encode upstream-only
# formatting artifacts.
normalize_managed_code_patch_files "$DEST"

rm -rf "$MEMORY_SEED_DEST"
mkdir -p "$STATE_SEED_ROOT"
git -C "$SOURCE" archive "$EXPECTED_COMMIT" memory | tar -x -C "$STATE_SEED_ROOT"
normalize_text_tree "$MEMORY_SEED_DEST"

for patch_name in "${MANAGED_PATCHES[@]}"; do
  patch="$ROOT/managed-ga/patches/$patch_name"
  if [[ ! -f "$patch" ]]; then
    echo "Managed GA patch listed in manifest is missing: $patch_name" >&2
    exit 2
  fi
  (cd "$ROOT" && git apply --whitespace=nowarn --directory=managed-ga/code "$patch")
  echo "Applied managed GA patch: $patch_name"
done

# Upstream sometimes ships incidental trailing spaces. Keep the generated
# checked-in payload compatible with Yole's `git diff --check` gate without
# baking whitespace-only removals into patch files that would fail that same gate.
normalize_managed_code_patch_files "$DEST"

echo "Managed GA code copied to $DEST"
echo "Managed GA memory seed copied to $MEMORY_SEED_DEST"
