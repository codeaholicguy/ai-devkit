#!/usr/bin/env bash
set -euo pipefail

# Print a quick checklist of lifecycle phases for a feature.
# Usage: phase-checklist.sh

cat <<'OUT'
Dev Lifecycle Phase Checklist
=============================

1. [ ] New Requirement   — Feature captured, docs structure created
2. [ ] Review Requirements — Requirements validated for completeness
3. [ ] Review Design     — Design reviewed, mermaid diagrams verified
4. [ ] Execute Plan      — Tasks executed from planning doc
5. [ ] Check Implementation — Code validated against design
6. [ ] Write Tests       — Unit/integration/E2E tests added (100% target)
7. [ ] Code Review       — Pre-push review completed

Feature name:
Planning doc:
Design doc:
Requirements doc:
OUT
