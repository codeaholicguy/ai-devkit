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

SERVER_PID=""
SERVER_LOG="$SMOKE_ROOT/server.log"

# Start a server in its own process group so stop_server can kill the whole tree.
start_server() {
  set -m
  "$@" >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  set +m
}

stop_server() {
  [[ -n "$SERVER_PID" ]] || return 0
  kill -TERM -- "-$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  SERVER_PID=""
}

# Poll until the URL answers below 500, failing fast if the server dies.
wait_for_url() {
  local url="$1" timeout="${2:-60}" code
  local deadline=$((SECONDS + timeout))
  while ((SECONDS < deadline)); do
    if [[ -n "$SERVER_PID" ]] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
      printf "server exited early:\n"
      tail -n 40 "$SERVER_LOG"
      return 1
    fi
    code="$(curl -s -o /dev/null -w "%{http_code}" "$url")"
    [[ "$code" != "000" && "$code" -lt 500 ]] && return 0
    sleep 0.5
  done
  printf "not ready after %ss: %s\n" "$timeout" "$url"
  tail -n 40 "$SERVER_LOG"
  return 1
}

# Set KEEP_SMOKE=1 to inspect the sandbox after a failure.
cleanup() {
  stop_server
  [[ "${KEEP_SMOKE:-0}" == "1" ]] || rm -rf "$SMOKE_ROOT"
}
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

# Assert an HTTP status code and print the body: expect_status 201 <url> [curl args].
expect_status() {
  local expected="$1" url="$2"
  shift 2
  local body="$SMOKE_ROOT/body" code
  code="$(curl -s -o "$body" -w "%{http_code}" "$@" "$url")"
  [[ -f "$body" ]] && cat "$body"
  printf "\n[http:%s]\n" "$code"
  [[ "$code" == "$expected" ]]
}

cd "$WORK_DIR" || exit 1
git init -q && git config core.hooksPath "$EMPTY_HOOKS_DIR"

# Scenarios: one run_check per setup / action / expected result.
# run_check "changed flow: <name>" expect_output "<expected text>" <app command> <args>
# run_check "adjacent flow: <name>" <app command> <args>

# API flows: start on a dedicated port, wait, then check status, body, and an error case.
# PORT=4180 start_server <server command>
# run_check "server ready" wait_for_url "http://127.0.0.1:4180/health" 60
# run_check "create item" expect_status 201 "http://127.0.0.1:4180/items" -X POST -H "Content-Type: application/json" -d '{"name":"smoke"}'
# run_check "item body" expect_output '"name":"smoke"' curl -s "http://127.0.0.1:4180/items"
# run_check "rejects bad input" expect_status 400 "http://127.0.0.1:4180/items" -X POST -d 'not-json'

printf "\n## SUMMARY\nroot=%s\npass=%s\nfail=%s\n" "$SMOKE_ROOT" "$pass" "$fail"
[[ ${#results[@]} -gt 0 ]] && printf "%s\n" "${results[@]}"

exit "$fail"
