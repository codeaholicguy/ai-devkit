#!/usr/bin/env bash
set -euo pipefail

# Infer current lifecycle phase for a feature by checking doc state.
# Usage: check-status.sh <feature-name>

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <feature-name>"
  exit 1
fi

FEATURE="$1"

if [[ ! "$FEATURE" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: feature name must contain only letters, digits, hyphens, and underscores"
  exit 1
fi

DOCS="docs/ai"

exists() { [[ -f "$1" ]]; }
nonempty() { [[ -f "$1" ]] && [[ -s "$1" ]]; }

latest_doc() {
  local phase="$1"
  local dated_pattern="$DOCS/$phase/"????-??-??"-feature-${FEATURE}.md"
  local legacy="$DOCS/$phase/feature-${FEATURE}.md"
  local matches=()

  # Let the shell expand the dated pattern when matches exist. With nullglob
  # enabled, an unmatched pattern contributes no literal value.
  shopt -s nullglob
  matches=( $dated_pattern )
  shopt -u nullglob

  if [[ ${#matches[@]} -gt 0 ]]; then
    printf '%s\n' "${matches[@]}" | sort | tail -n 1
    return 0
  fi

  if exists "$legacy"; then
    echo "$legacy"
    return 0
  fi

  echo "$legacy"
}

REQ="$(latest_doc requirements)"
DES="$(latest_doc design)"
PLN="$(latest_doc planning)"
IMP="$(latest_doc implementation)"
TST="$(latest_doc testing)"

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
  echo "Phase 1 (New Requirement) — design exists but no planning doc"
elif exists "$PLN" && [[ ${TODO:-0} -gt 0 ]]; then
  echo "Phase 4 (Execute Plan) — $TODO tasks remaining"
elif exists "$PLN" && [[ ${TODO:-0} -eq 0 ]] && [[ ${TOTAL:-0} -gt 0 ]]; then
  echo "Phase 6 (Check Implementation) — all tasks done, verify against design"
else
  echo "Phase 2 (Review Requirements) — docs exist, review for completeness"
fi
