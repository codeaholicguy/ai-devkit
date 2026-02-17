#!/usr/bin/env bash
set -euo pipefail

# Verify AI DevKit doc structure and feature docs.
# Usage:
#   check-docs.sh            — check base structure only (prerequisite)
#   check-docs.sh <feature>  — check base structure + feature docs

DOCS_DIR="docs/ai"
PHASES=(requirements design planning implementation testing)
MISSING=0

check_base() {
  echo "=== Base Structure ==="
  for phase in "${PHASES[@]}"; do
    local dir="$DOCS_DIR/$phase"
    local tmpl="$dir/README.md"
    if [[ -f "$tmpl" ]]; then
      echo "[OK]    $tmpl"
    else
      echo "[MISS]  $tmpl"
      MISSING=$((MISSING + 1))
    fi
  done
}

check_feature() {
  local feature="$1"
  echo ""
  echo "=== Feature: $feature ==="
  for phase in "${PHASES[@]}"; do
    local path="$DOCS_DIR/$phase/feature-${feature}.md"
    if [[ -f "$path" ]]; then
      echo "[OK]    $path"
    else
      echo "[MISS]  $path"
      MISSING=$((MISSING + 1))
    fi
  done
}

check_base

if [[ $# -ge 1 ]]; then
  check_feature "$1"
fi

echo ""
if [[ $MISSING -eq 0 ]]; then
  echo "All checks passed."
else
  echo "$MISSING item(s) missing."
  if [[ ! -d "$DOCS_DIR" ]]; then
    echo "Run: npx ai-devkit init"
  fi
  exit 1
fi
