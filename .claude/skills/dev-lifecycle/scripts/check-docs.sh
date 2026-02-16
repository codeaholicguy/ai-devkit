#!/usr/bin/env bash
set -euo pipefail

# Verify that all required AI DevKit phase docs exist for a feature.
# Usage: check-docs.sh <feature-name>

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <feature-name>"
  echo "Example: $0 user-authentication"
  exit 1
fi

FEATURE="$1"
DOCS_DIR="docs/ai"
MISSING=0

check_doc() {
  local phase="$1"
  local path="$DOCS_DIR/$phase/feature-${FEATURE}.md"
  if [[ -f "$path" ]]; then
    echo "[OK]    $path"
  else
    echo "[MISS]  $path"
    MISSING=$((MISSING + 1))
  fi
}

echo "=== Dev Lifecycle Doc Check: $FEATURE ==="
echo ""

check_doc "requirements"
check_doc "design"
check_doc "planning"
check_doc "implementation"
check_doc "testing"

echo ""
if [[ $MISSING -eq 0 ]]; then
  echo "All phase docs present."
else
  echo "$MISSING doc(s) missing. Create from templates in each directory's README.md."
  exit 1
fi
