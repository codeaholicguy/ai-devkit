#!/usr/bin/env bash
# Pack built workspace artifacts into a disposable local npm registry, then print
# the package spec release-smoke.sh should exercise (ai-devkit@<version>).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY_HOST="${AI_DEVKIT_SMOKE_REGISTRY_HOST:-127.0.0.1}"
REGISTRY_PORT="${AI_DEVKIT_SMOKE_REGISTRY_PORT:-4873}"
REGISTRY="http://${REGISTRY_HOST}:${REGISTRY_PORT}"
VERDACCIO_PID=""

cleanup() {
  if [[ -n "$VERDACCIO_PID" ]] && kill -0 "$VERDACCIO_PID" 2>/dev/null; then
    kill "$VERDACCIO_PID" 2>/dev/null || true
    wait "$VERDACCIO_PID" 2>/dev/null || true
  fi
  rm -f /tmp/verdaccio-smoke.pid
}
if [[ "${AI_DEVKIT_SMOKE_KEEP_REGISTRY:-}" != "1" ]]; then
  trap cleanup EXIT
fi

log() {
  printf "%s\n" "$*"
}

publish_dir() {
  local dir="$1"
  log "+ npm publish $dir -> $REGISTRY"
  (cd "$dir" && npm publish --registry "$REGISTRY" --access public --ignore-scripts)
}

VERDACCIO_LOG="/tmp/verdaccio-smoke.log"
VERDACCIO_CONFIG="$ROOT/scripts/verdaccio-smoke-config.yaml"

wait_for_registry() {
  local attempts=0
  until curl -sf "$REGISTRY/-/ping" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if ! kill -0 "$VERDACCIO_PID" 2>/dev/null; then
      log "Verdaccio exited before becoming ready."
      [[ -f "$VERDACCIO_LOG" ]] && tail -n 40 "$VERDACCIO_LOG" >&2 || true
      exit 1
    fi
    if [[ $attempts -ge 180 ]]; then
      log "Local registry at $REGISTRY did not become ready."
      tail -n 40 "$VERDACCIO_LOG" >&2 || true
      exit 1
    fi
    sleep 1
  done
}

reset_registry_storage() {
  rm -rf /tmp/verdaccio-smoke-storage
  mkdir -p /tmp/verdaccio-smoke-storage
}

prepare_htpasswd() {
  local file="/tmp/verdaccio-smoke-htpasswd"
  if [[ -f "$file" ]] && grep -q '^smoke:' "$file" 2>/dev/null; then
    return 0
  fi
  if ! command -v htpasswd >/dev/null 2>&1; then
    log "htpasswd is required to seed the smoke registry (install apache2-utils)."
    exit 1
  fi
  htpasswd -cbB "$file" smoke smoke
}

configure_npm_for_registry() {
  local key="//${REGISTRY_HOST}:${REGISTRY_PORT}/"
  npm config set "${key}:username" smoke
  npm config set "${key}:_password" "$(printf '%s' 'smoke' | base64 -w0)"
  npm config set "${key}:email" "smoke@example.com"
  if ! npm whoami --registry "$REGISTRY" >/dev/null 2>&1; then
    log "npm auth for $REGISTRY failed (npm whoami)."
    exit 1
  fi
}

cd "$ROOT"

if [[ ! -d packages/cli/dist ]]; then
  log "packages/cli is not built; run npm run build first."
  exit 1
fi

CLI_VERSION="$(node -p "require('$ROOT/packages/cli/package.json').version")"
DAEMON_CLIENT_VERSION="$(node -p "require('$ROOT/packages/daemon-client/package.json').version")"

# Build linux-x64 devkitd the same way publish-devkitd.yml does.
log "Building devkitd (linux-x64 musl) with buildVersion=$DAEMON_CLIENT_VERSION"
export DEVKITD_BUILD_VERSION="$DAEMON_CLIENT_VERSION"
(
  cd "$ROOT/rust"
  cargo build --release --target x86_64-unknown-linux-musl -p devkitd
)
OUT="$ROOT/out/devkitd-linux-x64"
mkdir -p "$OUT"
cp "$ROOT/npm/devkitd-linux-x64/package.json" "$OUT/"
cp "$ROOT/rust/target/x86_64-unknown-linux-musl/release/devkitd" "$OUT/devkitd"
chmod +x "$OUT/devkitd"
npm pkg set version="$DAEMON_CLIENT_VERSION" --prefix "$OUT"

STAGE_DAEMON="$ROOT/out/daemon-client-smoke"
rm -rf "$STAGE_DAEMON"
mkdir -p "$STAGE_DAEMON"
cp -R "$ROOT/packages/daemon-client/." "$STAGE_DAEMON/"
log "Staging daemon-client with platform optionalDependencies for smoke"
for p in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  npm pkg set "optionalDependencies.@ai-devkit/devkitd-$p=$DAEMON_CLIENT_VERSION" --prefix "$STAGE_DAEMON"
done

if [[ ! -f "$VERDACCIO_CONFIG" ]]; then
  log "Missing Verdaccio config: $VERDACCIO_CONFIG"
  exit 1
fi

if command -v verdaccio >/dev/null 2>&1; then
  VERDACCIO_BIN=(verdaccio)
else
  # Warm the package cache so startup is not counted against the readiness timeout.
  npm install --no-save verdaccio@6 >/dev/null 2>&1
  VERDACCIO_BIN=(npx verdaccio@6)
fi

prepare_htpasswd
reset_registry_storage

log "Starting local Verdaccio on $REGISTRY"
"${VERDACCIO_BIN[@]}" -c "$VERDACCIO_CONFIG" >"$VERDACCIO_LOG" 2>&1 &
VERDACCIO_PID=$!
printf '%s\n' "$VERDACCIO_PID" >/tmp/verdaccio-smoke.pid
wait_for_registry
configure_npm_for_registry

# Publish dependency packages before the CLI tarball they pin.
publish_dir "$ROOT/packages/memory"
publish_dir "$ROOT/packages/agent-manager"
publish_dir "$ROOT/packages/channel-connector"
publish_dir "$OUT"
publish_dir "$STAGE_DAEMON"
publish_dir "$ROOT/packages/cli"

PACKAGE_SPEC="ai-devkit@${CLI_VERSION}"
export AI_DEVKIT_SMOKE_REGISTRY="$REGISTRY"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "registry=$REGISTRY"
    echo "package_spec=$PACKAGE_SPEC"
  } >>"$GITHUB_OUTPUT"
fi
printf "%s\n" "$PACKAGE_SPEC"