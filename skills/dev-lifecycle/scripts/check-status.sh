#!/usr/bin/env bash
set -euo pipefail

# Infer current lifecycle phase for a feature by checking doc state.
# Usage: check-status.sh <feature-name>

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <feature-name>"
  exit 1
fi

FEATURE="$1"
AI_DEVKIT_BIN="${AI_DEVKIT_BIN:-npx ai-devkit@latest}"

if [[ ! "$FEATURE" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: feature name must contain only letters, digits, hyphens, and underscores"
  exit 1
fi

exists() { [[ -f "$1" ]]; }
nonempty() { [[ -f "$1" ]] && [[ -s "$1" ]]; }

LINT_OUTPUT="$($AI_DEVKIT_BIN lint --feature "$FEATURE" 2>/dev/null || true)"

lint_doc() {
  local phase="$1"
  awk -v phase="$phase" '
    /^=== Feature:/ { in_feature = 1; next }
    /^=== Git:/ { in_feature = 0 }
    in_feature && $0 ~ "\\]  .*/" phase "/" {
      sub(/^[^]]*][[:space:]]+/, "", $0)
      print
      exit
    }
  ' <<< "$LINT_OUTPUT"
}

REQ="$(lint_doc requirements)"
DES="$(lint_doc design)"
PLN="$(lint_doc planning)"
IMP="$(lint_doc implementation)"
TST="$(lint_doc testing)"

if [[ -z "$REQ" || -z "$DES" || -z "$PLN" || -z "$IMP" || -z "$TST" ]]; then
  echo "Error: could not resolve feature docs from 'ai-devkit lint --feature $FEATURE'"
  echo "Run: $AI_DEVKIT_BIN lint --feature $FEATURE"
  exit 1
fi

echo "=== Status: $FEATURE ==="

# Check which docs exist
for doc in "$REQ" "$DES" "$PLN" "$IMP" "$TST"; do
  if exists "$doc"; then
    echo "[EXISTS] $doc"
  else
    echo "[MISS]   $doc"
  fi
done

# Count planning tasks if planning doc exists
if exists "$PLN"; then
  TOTAL=$(grep -Ec '^[[:space:]]*- \[' "$PLN" 2>/dev/null || true)
  DONE=$(grep -Ec '^[[:space:]]*- \[x\]' "$PLN" 2>/dev/null || true)
  TOTAL=${TOTAL:-0}
  DONE=${DONE:-0}
  TODO=$((TOTAL - DONE))
  echo ""
  echo "Planning: $DONE/$TOTAL tasks done, $TODO remaining"
fi

# Infer phase
echo ""
echo "--- Suggested phase ---"
if ! exists "$REQ"; then
  echo "Phase 1 (New Requirement) — no requirements doc yet"
elif ! exists "$DES"; then
  echo "Phase 1 (New Requirement) — requirements exist but no design doc"
elif ! exists "$PLN"; then
  echo "Phase 4 (Create Initial Plan) — design exists but no planning doc"
elif exists "$PLN" && [[ ${TODO:-0} -gt 0 ]]; then
  echo "Phase 5 (Execute Plan) — $TODO tasks remaining"
elif exists "$PLN" && [[ ${TODO:-0} -eq 0 ]] && [[ ${TOTAL:-0} -gt 0 ]]; then
  echo "Phase 7 (Check Implementation) — all tasks done, verify against design"
else
  echo "Phase 2 (Review Requirements) — docs exist, review for completeness"
fi
