#!/usr/bin/env bash
set -u

PACKAGE_SPEC="${1:-ai-devkit@latest}"
PACKAGE_NAME="ai-devkit"
SMOKE_ID="$(date +%Y%m%d%H%M%S)-$$"
SMOKE_ROOT="${AI_DEVKIT_SMOKE_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/ai-devkit-release-smoke.XXXXXX")}"
INSTALL_DIR="$SMOKE_ROOT/install"
PROJECT_DIR="$SMOKE_ROOT/project"
PHASE_DIR="$SMOKE_ROOT/phase-project"
FEATURE_BASE_DIR="$SMOKE_ROOT/feature-base"
UPGRADE_DIR="$SMOKE_ROOT/upgrade"
ISOLATED_HOME="$SMOKE_ROOT/home"
EMPTY_HOOKS_DIR="$SMOKE_ROOT/empty-hooks"

mkdir -p "$INSTALL_DIR" "$PROJECT_DIR" "$PHASE_DIR" "$FEATURE_BASE_DIR" "$UPGRADE_DIR" "$ISOLATED_HOME" "$EMPTY_HOOKS_DIR"

export NODE_NO_WARNINGS=1
export npm_config_cache="${npm_config_cache:-$HOME/.npm}"
export npm_config_yes=true
export CI="${CI:-1}"
export NO_COLOR="${NO_COLOR:-1}"
export TERM="${TERM:-dumb}"

pass=0
fail=0
declare -a results=()

log() {
  printf "%s\n" "$*"
}

run_check() {
  local name="$1"
  shift

  log ""
  log "## $name"
  printf "+ "
  printf "%q " "$@"
  printf "\n"

  "$@" </dev/null
  local code=$?
  log "[exit:$code]"

  if [[ $code -eq 0 ]]; then
    pass=$((pass + 1))
    results+=("PASS|$name|$code")
  else
    fail=$((fail + 1))
    results+=("FAIL|$name|$code")
  fi
}

run_npx_check() {
  local name="$1"
  shift
  run_check "$name" npx -y "$PACKAGE_SPEC" "$@"
}

configure_git_repo() {
  git init
  git config user.email "smoke@example.com"
  git config user.name "AI DevKit Smoke"
  git config core.hooksPath "$EMPTY_HOOKS_DIR"
}

verify_init_files() {
  test -f .ai-devkit.json
  test -f docs/ai/requirements/README.md
  test -f docs/ai/design/README.md
  test -f docs/ai/planning/README.md
  test -f docs/ai/implementation/README.md
  test -f docs/ai/testing/README.md
  test -f docs/ai/deployment/README.md
  test -f docs/ai/monitoring/README.md
}

verify_json() {
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$1"
}

configure_project_memory() {
  node -e "
    const fs = require('fs');
    const configPath = '.ai-devkit.json';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.memory = { path: '.ai-devkit/memory.db' };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  "
}

run_json_output_check() {
  local name="$1"
  shift
  local output_file="$SMOKE_ROOT/${name//[^a-zA-Z0-9]/-}.json"

  log ""
  log "## $name"
  printf "+ "
  printf "%q " "$@"
  printf "\n"

  "$@" >"$output_file" </dev/null
  local code=$?
  cat "$output_file"
  log "[exit:$code]"

  if [[ $code -eq 0 ]] && verify_json "$output_file"; then
    pass=$((pass + 1))
    results+=("PASS|$name|$code")
  else
    fail=$((fail + 1))
    results+=("FAIL|$name|$code")
  fi
}

log "AI DevKit release smoke"
log "package=$PACKAGE_SPEC"
log "root=$SMOKE_ROOT"

run_check "npm view version" npm view "$PACKAGE_SPEC" version
run_check "npm view dist-tags" npm view "$PACKAGE_NAME" dist-tags --json
run_npx_check "npx version" --version
run_npx_check "npx help" --help

cd "$INSTALL_DIR" || exit 1
run_check "clean npm init" npm init -y
run_check "clean npm install" npm install "$PACKAGE_SPEC"
run_check "local install version" npx ai-devkit --version
run_check "local install help" npx ai-devkit --help

cd "$PROJECT_DIR" || exit 1
run_check "git init project" configure_git_repo
run_npx_check "init codex all" init -e codex --all
run_check "configure project memory" configure_project_memory
run_check "verify init files" verify_init_files
run_npx_check "lint" lint
run_json_output_check "lint json" npx -y "$PACKAGE_SPEC" lint --json
run_npx_check "docs init feature" docs init-feature smoke-release

cd "$PHASE_DIR" || exit 1
run_check "git init phase project" configure_git_repo
run_npx_check "init requirements only" init -e codex -p requirements
run_npx_check "phase testing" phase testing
run_check "verify phase testing file" test -f docs/ai/testing/README.md

cd "$FEATURE_BASE_DIR" || exit 1
run_check "git init feature project" configure_git_repo
run_npx_check "init all for feature lint" init -e codex --all
run_npx_check "docs init feature for lint" docs init-feature smoke-release
run_check "commit feature lint base" git add .
run_check "commit feature lint docs" git commit -m "smoke base"
run_check "create feature worktree" git worktree add -b feature-smoke-release "$SMOKE_ROOT/feature-smoke-release"
run_json_output_check "lint feature json" npx -y "$PACKAGE_SPEC" lint --feature smoke-release --json

cd "$PROJECT_DIR" || exit 1
run_check "isolated setup" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" setup
run_npx_check "skill list" skill list
run_npx_check "skill find testing" skill find testing

mkdir -p local-registry/skills/smoke-skill
printf "%s\n" "---" "description: Smoke test skill" "---" "# Smoke Skill" > local-registry/skills/smoke-skill/SKILL.md
run_npx_check "skill add local registry" skill add-registry local/smoke ./local-registry
run_npx_check "skill add local skill" skill add local/smoke smoke-skill
run_npx_check "skill remove local skill" skill remove smoke-skill
run_npx_check "skill remove local registry" skill remove-registry local/smoke

run_npx_check "memory store" memory store \
  -t "Release smoke memory $SMOKE_ID" \
  -c "This confirms the released AI DevKit CLI can store searchable project knowledge after installation for smoke run $SMOKE_ID."
run_json_output_check "memory search" npx -y "$PACKAGE_SPEC" memory search -q "$SMOKE_ID"
run_npx_check "memory search table" memory search -q "$SMOKE_ID" --table

run_npx_check "agent help" agent --help
run_check "agent list" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" agent list
run_check "agent sessions" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" agent sessions
run_json_output_check "agent sessions json" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" agent sessions --json
run_check "agent group list" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" agent group list
run_check "status" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" status
run_npx_check "install" install

previous_version="$(npm view ai-devkit versions --json | node -e "let input=''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const versions = JSON.parse(input); console.log(versions[versions.length - 2] || ''); });")"
if [[ -n "$previous_version" && "$PACKAGE_SPEC" == "ai-devkit@latest" ]]; then
  cd "$UPGRADE_DIR" || exit 1
  run_check "git init upgrade project" configure_git_repo
  run_check "previous init $previous_version" npx -y "ai-devkit@$previous_version" init -e codex --all
  run_npx_check "latest lint on previous project" lint
  run_npx_check "latest install on previous project" install
  run_check "latest status on previous project" env "HOME=$ISOLATED_HOME" npx -y "$PACKAGE_SPEC" status
else
  log ""
  log "## upgrade smoke"
  log "Skipped because package spec is not ai-devkit@latest or no previous version was found."
fi

log ""
log "## SUMMARY"
log "root=$SMOKE_ROOT"
log "package=$PACKAGE_SPEC"
log "pass=$pass"
log "fail=$fail"
printf "%s\n" "${results[@]}"

exit "$fail"
