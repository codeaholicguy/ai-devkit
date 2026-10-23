#!/usr/bin/env bash
# Disposable smoke script template. Copy outside the repo, fill in the checks, run, then delete.
set -u

SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/dev-smoke.XXXXXX")"
ISOLATED_HOME="$SMOKE_ROOT/home"
WORK_DIR="$SMOKE_ROOT/work"
EMPTY_HOOKS_DIR="$SMOKE_ROOT/empty-hooks"
mkdir -p "$ISOLATED_HOME" "$WORK_DIR" "$EMPTY_HOOKS_DIR"

export HOME="$ISOLATED_HOME"
export GIT_CONFIG_GLOBAL="$ISOLATED_HOME/.gitconfig"
export CI=1 NO_COLOR=1 TERM=dumb

# Set KEEP_SMOKE=1 to inspect the sandbox after a failure.
cleanup() { [[ "${KEEP_SMOKE:-0}" == "1" ]] || rm -rf "$SMOKE_ROOT"; }
trap cleanup EXIT

pass=0
fail=0
declare -a results=()

run_check() {
  local name="$1"
  shift
  printf "\n## %s\n+ " "$name"
  printf "%q " "$@"
  printf "\n"

  "$@" </dev/null
  local code=$?
  printf "[exit:%s]\n" "$code"

  if [[ $code -eq 0 ]]; then
    pass=$((pass + 1))
    results+=("PASS|$name")
  else
    fail=$((fail + 1))
    results+=("FAIL|$name|exit:$code")
  fi
}

# Assert that a command succeeds and its output contains an expected string.
expect_output() {
  local expected="$1"
  shift
  local output
  output="$("$@" 2>&1)" || { printf "%s\n" "$output"; return 1; }
  printf "%s\n" "$output"
  grep -qF -- "$expected" <<<"$output"
}

cd "$WORK_DIR" || exit 1
git init -q && git config core.hooksPath "$EMPTY_HOOKS_DIR"

# Scenarios: one run_check per setup / action / expected result.
# run_check "changed flow: <name>" expect_output "<expected text>" <app command> <args>
# run_check "adjacent flow: <name>" <app command> <args>

printf "\n## SUMMARY\nroot=%s\npass=%s\nfail=%s\n" "$SMOKE_ROOT" "$pass" "$fail"
[[ ${#results[@]} -gt 0 ]] && printf "%s\n" "${results[@]}"

exit "$fail"
