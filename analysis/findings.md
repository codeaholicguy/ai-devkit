# TLA+ Formal Analysis Findings Report — `ai-devkit` (`63a46430` / v0.78.0)

**Scope**: Formal modeling (TLA+ / TLC 2.19) of concurrent, daemon-mediated state machines in `ai-devkit`, with deep-dive root-cause traces for the **three live-symptom violations** observed in production plus the full inventory and findings split across all five modeled state machines.

**Artifacts in `analysis/`** (all uncommitted; zero tracked files modified):
- Models: `DurableRun.tla`, `DurableRepoTS.tla`, `AgentRegistrySweep.tla`, `SessionMappingCache.tla`, `DaemonAutostart.tla`
- Verbatim TLC traces for the 3 live-symptom violations: `trace_1_phantom_disappeared.txt`, `trace_2_lost_sessions_json.txt`, `trace_3a_dual_daemons.txt`, `trace_3b_unlink_live_sock.txt`

---

## 1. Deep Dive: Three Live-Symptom Violations

### Live Violation 1 — `Inv_NoPhantomDisappeared` in `AgentRegistrySweep.tla`
- **Observed live symptom**: `send` refused (`"no longer running"`) while the target agent PID was alive.
- **Classification**: **CONFIRMED REAL BUG (High Severity)**.
  - *Why not a modeling artifact*: Every step in the counterexample corresponds 1-to-1 to unsynchronized code paths in `devkitd` (`server.rs:240-316`, `server.rs:443-455`, `rpc/agent/start.rs:190`, `rpc/agent/rename.rs:179`). There is literally no mutex or generation check preventing the 2s periodic sweep thread and an RPC-triggered sweep (`agent.start` / `agent.rename`) from executing `Daemon::apply_sweep()` concurrently and committing their snapshots out of order.

#### Verbatim TLC Counterexample Trace (`analysis/trace_1_phantom_disappeared.txt`, depth 4)
```text
Error: Invariant Inv_NoPhantomDisappeared is violated.
State 1: <Initial predicate>
  osAlive = [p1 |-> FALSE], dbPresent = [p1 |-> FALSE], dbName = [p1 |-> "NULL"],
  dbGone = [p1 |-> FALSE], enrichedPids = {}, sweptPids = {}, swPc = "idle"

State 2: <TimerSweepCapture (AgentRegistrySweep.tla:166-174)>
  swPc = "snapshotted", swSnapAlive = [p1 |-> FALSE], swSnapGen = [p1 |-> "NULL"]
  (osAlive = [p1 |-> FALSE], enrichedPids = {})

State 3: <AgentStartWithPostSweep (AgentRegistrySweep.tla:117-158)>
  osAlive = [p1 |-> TRUE], osGen = [p1 |-> "g1"],
  dbPresent = [p1 |-> TRUE], dbName = [p1 |-> "a"], dbGen = [p1 |-> "g1"], dbGone = [p1 |-> FALSE],
  legacyName = [p1 |-> "a"], enrichedPids = {"p1"}, sweptPids = {"p1"},
  swPc = "snapshotted" (still holding stale swSnapAlive = [p1 |-> FALSE]!)

State 4: <TimerSweepApply (AgentRegistrySweep.tla:177-210)>
  osAlive = [p1 |-> TRUE],
  enrichedPids = {}, sweptPids = {},
  dbPresent = [p1 |-> TRUE], dbName = [p1 |-> "a"], dbGone = [p1 |-> TRUE],
  phantomDisappeared = TRUE, staleEnrichedOverwrite = TRUE
```
*(54 states generated, 39 distinct states found, depth 4, 0s)*

#### Concrete Rust / TS Interleaving (`file:line` Citations)
1. **T0 — Background timer starts sweep `S1`**:
   - `rust/crates/devkitd/src/server.rs:443-455` spawns `d.apply_sweep()` on the blocking pool every 2s.
   - `server.rs:244` runs `devkit_core::discover::sweep()`, returning `all` **without** `p1` (not spawned yet).
   - `server.rs:264-276` performs `enrich_agents`, `resolve_session_files`, and `self.enricher.enrich(&ctx)` — slow synchronous disk/proc I/O with **no lock held**.
2. **T1 — `agent.start` spawns `p1` and runs its own `apply_sweep()` (`S2`)**:
   - `rust/crates/devkitd/src/rpc/agent/start.rs:72` locks `start_mutex` (which `apply_sweep` does **not** lock).
   - `start.rs:114-162` spawns `p1` and calls `daemon.store.register_start(p1, "a", ...)` (`store/registry.rs:56-98`).
   - `start.rs:190` calls `daemon.apply_sweep()` (`S2`): `S2` sees `p1`, sets `self.enriched = [p1]` (`server.rs:290`), runs `store.apply_agent_snapshot(&[p1])` (`store.rs:155-255`: sets `start_time_ms = g1`, `gone_at = NULL`), sets `self.swept_pids = {p1}`, and emits `agent.appeared(p1)`.
   - `agent.start` returns `Ok` to the CLI caller.
3. **T2 — Stale timer sweep `S1` finishes and clobbers `S2`**:
   - `server.rs:290`: `S1` executes `std::mem::replace(&mut *self.enriched.write().unwrap(), enriched_stale)` — **wiping `p1` out of `self.enriched`!**
   - `server.rs:291`: `S1` executes `self.store.apply_agent_snapshot(&procs_stale)` (`store.rs:216-229`): sees `p1` is registered (`name = "a"`) and absent from `procs_stale`, so it **tombstones `p1` (`UPDATE agents SET gone_at = now WHERE pid = p1`)** and pushes `p1` into `gone`.
   - `server.rs:295`: `S1` replaces `self.swept_pids` with `{}`.
   - `server.rs:301-303`: `S1` emits a **phantom `agent.disappeared(p1)`** event for the live agent.
4. **T3 — Downstream `send` refusal (`"no longer running"`)**:
   - **Path A (via `enriched` cache wiped)**: Any caller using `agent.list` (`server.rs:146-148`) or `waitForAgentResponse` (`packages/cli/src/services/agent/agent.service.ts:183-187`) gets the stale `enriched` list without `p1` (when another agent is also present, `AgentManager.listAgents()` treats a non-empty daemon answer as authoritative at `packages/agent-manager/src/AgentManager.ts:226-251` and skips local adapters!) and immediately throws `Agent "<name>" is no longer running.` (`agent.service.ts:186` / `AgentManager.ts:113`), or `resolveAgentByName` fails to find it.
   - **Path B (via `agent.lookup` + `agent.send` / `sendToAgentGroup` — secondary trigger to verify)**: Note also `packages/cli/src/commands/agent/send.command.ts:87-89` (`if (!entry.alive) throw new Error('Agent "..." is registered but no longer running; not sending.')`) and `agent.service.ts:365-368`, which check `entry.alive = pid_alive(reg.pid)` (`rust/crates/devkitd/src/rpc/agent/lookup.rs:20`, `discover::pid_alive` = `libc::kill(pid, 0) == 0 || EPERM`). While `pid_alive` does not read `gone_at`, **if `agent.lookup` resolved a tombstoned/stale PID row** (e.g., via `import_legacy_agents` resurrecting an older dead PID row or an `agent.start` race with a stale legacy row, see Bug #6 below, or `EACCES`/wrong PID from `PidPolling`), `!entry.alive` throws that exact message; whereas if `send --id` goes through `agent.list` / `waitForAgentResponse`, the stale `apply_sweep` overwrite of `self.enriched` directly drops the live agent for up to 2 seconds and produces `"no longer running"` while the PID is alive.
   - Additionally, any TUI/subscriber listening to daemon events receives `agent.disappeared(p1)` right after `agent.started` / `agent.appeared`, and `agent.rename` (`rename.rs:179`) suffers the exact same overwrite where a stale timer sweep reverts `self.enriched` to the old name.

#### Proposed Fix Direction
1. **Add `sweep_mutex: Mutex<()>` on `Daemon`** (`server.rs:14-37`) and acquire it for the entire body of `apply_sweep()` — OR track a monotonic `sweep_seq: AtomicU64` captured *before* `discover::sweep()` and discard any sweep whose `seq` is less than `last_applied_sweep_seq` under a lock guarding `enriched`, `apply_agent_snapshot`, and `swept_pids`.
   - Using `sweep_mutex` is simplest and guarantees `agent.start` / `agent.rename`'s post-op sweep always observes a fresh `discover::sweep()` taken *after* registration, never overwritten by an earlier timer pass.
2. Optionally, in `apply_sweep()`, coalesce redundant timer ticks with `try_lock()` so the 2s loop skips a tick if an RPC-triggered sweep is already in progress, while RPC callers (`agent.start`, `agent.rename`) block on `lock()` to guarantee fresh post-op state.

---

### Live Violation 2 — `Inv_NoLostSessionsJsonEntry` in `SessionMappingCache.tla`
- **Observed live symptom**: Live PID entry lost from the harness session mapping file (`sessions.json`), observed **twice tonight**.
- **Classification**: **CONFIRMED REAL BUG (High Severity — directly explains both occurrences tonight)**.
  - *Why not a modeling artifact*: Both the Pi extension (`packages/pi-session-tracker/extensions/index.ts:38-50`) and the Codex hook (`hooks/codex/codex-session-mapping.cjs:162-165`) perform an **unlocked read-modify-write** on a single shared JSON file (`~/.pi/agent/sessions.json` / `~/.codex/ai-devkit/sessions.json`). Whenever two processes start, restart sessions, or shut down within the same read→parse→stringify→write window, the second writer unconditionally clobbers the first writer's entry. Furthermore, `codex-session-mapping.cjs:113` writes directly with `fs.writeFileSync` (no temp+rename), introducing a **second** failure mode where a concurrent reader sees truncated JSON, `readRegistry()` catches the `JSON.parse` error and returns `{}` (`codex-session-mapping.cjs:103-106`), and the writer then overwrites `sessions.json` with **only its own single PID — wiping EVERY other live PID from the file at once!**

#### Verbatim TLC Counterexample Trace (`analysis/trace_2_lost_sessions_json.txt`, depth 7)
```text
Error: Invariant Inv_NoLostSessionsJsonEntry is violated.
State 1: <Initial predicate>
  procAlive = [p1 |-> FALSE, p2 |-> FALSE], sessJson = [p1 |-> "NULL", p2 |-> "NULL"],
  rmwPc = [p1 |-> "idle", p2 |-> "idle"]

State 2: <SpawnProcess (SessionMappingCache.tla:92-102)>
  procAlive = [p1 |-> TRUE, p2 |-> FALSE], procTrueSess = [p1 |-> "s1", p2 |-> "NULL"]

State 3: <SpawnProcess (SessionMappingCache.tla:92-102)>
  procAlive = [p1 |-> TRUE, p2 |-> TRUE], procTrueSess = [p1 |-> "s1", p2 |-> "s1"]

State 4: <HookReadJson (SessionMappingCache.tla:116-124)>
  p1 reads sessions.json -> rmwSnap[p1] = [p1 |-> "NULL", p2 |-> "NULL"], rmwPc[p1] = "read_json"

State 5: <HookReadJson (SessionMappingCache.tla:116-124)>
  p2 reads sessions.json -> rmwSnap[p2] = [p1 |-> "NULL", p2 |-> "NULL"], rmwPc[p2] = "read_json"

State 6: <HookWriteJson (SessionMappingCache.tla:127-136)>
  p1 writes sessions.json -> sessJson = [p1 |-> "s1", p2 |-> "NULL"], hookCommitted[p1] = TRUE

State 7: <HookWriteJson (SessionMappingCache.tla:127-136)>
  p2 writes sessions.json from its stale rmwSnap[p2] ->
  sessJson = [p1 |-> "NULL", p2 |-> "s1"], lostSessionsJsonEntry = TRUE!
```
*(1,093 states generated, 486 distinct states found, depth 7, 0s)*

#### Concrete Rust / TS Interleaving (`file:line` Citations)
1. **Pi tracker (`packages/pi-session-tracker/extensions/index.ts:38-50`)**:
   - Process `p1` enters `pi.on("session_start")` (L38): calls `readRegistry(file)` (L40), gets `{}`.
   - Process `p2` enters `pi.on("session_start")` or `pi.on("session_shutdown")` (L38/L45): calls `readRegistry(file)` (L40/L47), also gets `{}` (or pre-`p1` snapshot).
   - `p1` executes `registry[String(p1)] = s1; writeRegistry(file, registry);` (L41–42) → temp file + `renameSync` commits `{ "p1": s1 }`.
   - `p2` executes `registry[String(p2)] = s2; writeRegistry(file, registry);` (L41–42) → temp file + `renameSync` **atomically replaces** `sessions.json` with `{ "p2": s2 }`, silently losing `p1`!
   - Note: `p1`'s `session_start` racing with *any other Pi process's* `session_shutdown` (L45–50) produces the exact same lost entry.
2. **Codex hook (`hooks/codex/codex-session-mapping.cjs:99-114`, `162-165`)** — **worse than Pi**:
   - Line 113 uses non-atomic `fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2), 'utf8')` (truncates file in place, then writes bytes).
   - Interleaving A (same lost-update RMW as Pi): two Codex hooks read before either writes; second overwrites first.
   - Interleaving B (catastrophic wipe on torn read): Hook `p1` is mid-`writeFileSync` (file truncated to 0 bytes or partial JSON). Hook `p2` calls `readRegistry()` (L103) → `JSON.parse` throws → caught at L104–105, **returning `{}`** → `p2` writes `{ "p2": s2 }` → **EVERY live Codex PID except `p2` is wiped from `sessions.json`!**
3. **Downstream amplification in adapters**:
   - Once `p1`'s entry is lost from `sessions.json`, `rust/crates/devkit-core/src/session_map.rs:66-76`, `rust/crates/devkit-harness/src/pi/mod.rs:200-227`, and `rust/crates/devkit-harness/src/codex/mod.rs:311-355` miss Stage 1 (`sessions.json`) and fall through to Stage 2 (`agents.db` cache), causing `p1` to either regress to a dead pre-restart session (see Bug #8) or drop to process-only until the locator happens to match within `MATCH_TOLERANCE_MS` (3 min — which fails for any session restarted >3 min after process start!).

#### Proposed Fix Direction
1. **Best architectural fix — Per-PID mapping files (matching Claude's pattern)**:
   - Write one file per process, e.g. `~/.pi/agent/sessions/<pid>.json` and `~/.codex/ai-devkit/sessions/<pid>.json` (with `{ pid, sessionFile, startedAt }`), via sibling temp file + `fs.renameSync`.
   - Eliminates cross-process contention completely (zero shared-file RMW, zero locking needed, trivial cleanup on shutdown or stale-PID prune).
   - Readers (`session_map.rs`, `pi/mod.rs`, `codex/mod.rs`, `PiSessionTracker.ts`, `CodexSessionMapping.ts`) read `<dir>/<pid>.json` first and fall back to legacy `sessions.json` during transition.
2. **Immediate tactical fix (if keeping `sessions.json` short-term)**:
   - Fix `hooks/codex/codex-session-mapping.cjs:111-114` to write via temp file (`${registryFile}.${process.pid}.tmp`) + `fs.renameSync`.
   - Wrap the read-modify-write in both `pi-session-tracker/extensions/index.ts` and `codex-session-mapping.cjs` with an `O_EXCL` lockfile (with short retry backoff + stale-lock reclaim) so concurrent hooks cannot clobber each other.

---

### Live Violation 3 — `Inv_AtMostOneLiveDaemon` & `Inv_NeverUnlinkLiveSocket` in `DaemonAutostart.tla`
- **Observed live symptom**: Two live daemons coexist, and `'Address already in use'` appears in `daemon.log`.
- **Classification**: **CONFIRMED REAL BUG (High Severity — directly explains `'Address already in use'` in `daemon.log` and dual-daemon coexistence)**.
  - *Why not a modeling artifact*: Both the client-side spawn lock release on timeout (`packages/daemon-client/src/autostart.ts:66-83`), the daemon's synchronous `apply_sweep()` before `serve()` (`rust/crates/devkitd/src/main.rs:36-38`), and `serve()`'s lock-free `exists() → connect() → remove_file() → bind()` sequence (`rust/crates/devkitd/src/server.rs:427-436`) are modeled directly from the shipped code.

#### Verbatim TLC Counterexample Traces

**Trace 3a — `Inv_AtMostOneLiveDaemon` (`analysis/trace_3a_dual_daemons.txt`, depth 6)**:
```text
Error: Invariant Inv_AtMostOneLiveDaemon is violated.
State 1: <Initial predicate>
  sockExists = FALSE, lockHolder = "NULL",
  dState = [d1 |-> "unspawned", d2 |-> "unspawned"], cPc = [c1 |-> "start", c2 |-> "start"]

State 2: <ClientAcquireLock (DaemonAutostart.tla:77-84)>
  lockHolder = "c1", cPc = [c1 |-> "got_lock_spawn", c2 |-> "start"]

State 3: <ClientSpawn (DaemonAutostart.tla:88-94)>
  dState = [d1 |-> "sweeping", d2 |-> "unspawned"], cPc = [c1 |-> "waiting_sock", c2 |-> "start"]

State 4: <ClientWaitTimeoutReleaseLock (DaemonAutostart.tla:100-107)>
  dState = [d1 |-> "sweeping", d2 |-> "unspawned"],
  lockHolder = "NULL", cPc = [c1 |-> "done", c2 |-> "start"]

State 5: <ClientAcquireLock (DaemonAutostart.tla:77-84)>
  lockHolder = "c2", cPc = [c1 |-> "done", c2 |-> "got_lock_spawn"]

State 6: <ClientSpawn (DaemonAutostart.tla:88-94)>
  dState = [d1 |-> "sweeping", d2 |-> "sweeping"],
  dualLiveDaemons = TRUE!
```
*(63 states generated, 51 distinct states found, depth 6, 0s)*

**Trace 3b — `Inv_NeverUnlinkLiveSocket` (`analysis/trace_3b_unlink_live_sock.txt`, depth 10)**:
```text
Error: Invariant Inv_NeverUnlinkLiveSocket is violated.
States 1–6: Same as Trace 3a, starting from post-crash stale socket (sockExists = TRUE, sockOwner = "NULL")
  -> Both d1 and d2 are spawned and sweeping (dualLiveDaemons = TRUE).

State 7: <DaemonServeCheckStaleSock (DaemonAutostart.tla:125-130)>
  d1 enters serve(): sockExists = TRUE, connect() fails -> dState[d1] = "serve_checked_dead"

State 8: <DaemonServeCheckStaleSock (DaemonAutostart.tla:125-130)>
  d2 enters serve(): sockExists = TRUE, connect() fails -> dState[d2] = "serve_checked_dead"

State 9: <DaemonServeUnlinkAndBind (DaemonAutostart.tla:135-141)>
  d1 calls remove_file(daemon.sock) + UnixListener::bind(daemon.sock) ->
  dState[d1] = "serving", sockOwner = "d1", dHasListener[d1] = TRUE

State 10: <DaemonServeUnlinkAndBind (DaemonAutostart.tla:135-141)>
  d2 executes its pending remove_file(daemon.sock) — UNLINKING d1's LIVE SOCKET —
  and calls UnixListener::bind(daemon.sock) ->
  dState = [d1 |-> "serving", d2 |-> "serving"], sockOwner = "d2", unlinkedLiveSocket = TRUE!
```
*(226 states generated, 134 distinct states found, depth 10, 0s)*

#### Concrete Rust / TS Interleaving (`file:line` Citations) — Explaining Both `'Address already in use'` AND Dual Daemons
1. **Trigger — slow startup exceeds 3s client lock hold**:
   - `rust/crates/devkitd/src/main.rs:36-38`:
     ```rust
     let daemon = Arc::new(Daemon::new(&data_dir(), socket_path(), dirs_home())?);
     daemon.apply_sweep(); // warm the cache BEFORE accepting clients / binding socket!
     server::serve(daemon).await
     ```
   - `packages/daemon-client/src/autostart.ts:67-83`: Client 1 creates `daemon.sock.spawn.lock` (`O_EXCL`), spawns `devkitd #1`, waits `waitForSocket(3000)` (L80), and **unconditionally calls `releaseSpawnLock(lockPath)` in `finally` (L82)** even on timeout!
   - When `Daemon::new()` (SQLite open, `import_legacy_agents`, `durable.reconcile`) + synchronous `apply_sweep()` (`ps`, `lsof`/procfs, JSONL parsing across all harnesses) takes >3s (or when systemd/manual `devkitd serve` races with CLI autostart, or `replaceStaleDaemon`'s lock expires), Client 1 releases `.spawn.lock` while `devkitd #1` has not yet called `serve()`.
   - Client 2 calls `ensureDaemon()`, acquires `.spawn.lock`, and spawns `devkitd #2`.
   - *(Note: even WITHOUT a 3s timeout, `autostart.ts:242-248` reclaims `.spawn.lock` after `STALE_LOCK_MS`, and manual `devkitd serve` / systemd bypasses `.spawn.lock` entirely!)*
2. **Outcome A — `'Address already in use'` in `daemon.log`** (when `sockExists = FALSE` at `serve()` entry):
   - Both `devkitd #1` and `devkitd #2` finish `apply_sweep()` and enter `rust/crates/devkitd/src/server.rs:427`: `if daemon.socket_path.exists()` is **`false`** for both!
   - `devkitd #1` calls `UnixListener::bind(&daemon.socket_path)` (L436) → succeeds.
   - `devkitd #2` calls `UnixListener::bind(&daemon.socket_path)` (L436) → fails with **`Address already in use` (`EADDRINUSE`)**, logged to `~/.ai-devkit/daemon.log` (`autostart.ts:198-204`).
   - Meanwhile, during `main.rs:36-37`, **both daemons already ran `Daemon::new()`, `import_legacy_agents()`, `durable.reconcile()`, and `apply_sweep()` concurrently against `daemon.db`** (breaking the single-writer invariant on `daemon.db` and `events`).
3. **Outcome B — Two permanently coexisting live daemons** (Trace 3b, when a stale `daemon.sock` exists from a crash/restart):
   - Both `devkitd #1` and `devkitd #2` enter `server.rs:427`, see `socket_path.exists() == true`, call `UnixStream::connect(&daemon.socket_path)` (L431), and both get `Err` (connection refused).
   - `devkitd #1` executes `remove_file` (L433) + `UnixListener::bind` (L436) and begins serving + running its 2s sweep loop.
   - `devkitd #2` executes its already-decided `remove_file` (L433) — **unlinking `devkitd #1`'s live socket file** — and calls `UnixListener::bind` (L436), succeeding!
   - Result: **two live `devkitd` processes running indefinitely**, both sweeping every 2s and writing `daemon.db`, with `devkitd #1` unreachable on the socket (the exact failure mode the comment at `server.rs:428-430` attempted to prevent).

#### Proposed Fix Direction
1. **Daemon-side exclusive `flock` singleton lock (`~/.ai-devkit/daemon.lock`) — primary fix**:
   - At the very start of `devkitd serve` (`main.rs:35`), *before* `Daemon::new()`, `apply_sweep()`, or touching `daemon.sock`, open `~/.ai-devkit/daemon.lock` and call `flock(fd, LOCK_EX | LOCK_NB)`.
   - If `EWOULDBLOCK`, exit cleanly with `"devkitd already running"` (no `Address already in use`, no `remove_file` race, no concurrent `daemon.db` opens or `apply_sweep()`).
   - Keep the locked file descriptor open for the entire process lifetime (the kernel automatically releases it on crash or `exit(0)` — zero stale-lock hazard!).
2. **Bind `daemon.sock` *before* running the initial `apply_sweep()`**:
   - Move `daemon.apply_sweep()` (`main.rs:37`) to run after `UnixListener::bind` (or inside `serve()` before accepting/first sweep, or warm asynchronously) so clients see the listening socket in milliseconds rather than timing out at 3s.
3. **Fix `autostart.ts` spawn lock**:
   - Do not unlink `.spawn.lock` if `waitForSocket` timed out while the spawned `child.pid` is still alive (or store the spawner/daemon PID in the lockfile and check liveness before reclaiming).

---

## 2. Full State Machine Inventory & TLC Run Summary

### State Machine Inventory (`63a46430` / v0.78.0)

| # | State Machine | Primary Files | Concurrency Risk | 0.78.0 Status | Model |
|---|---|---|---|---|---|
| 1a | **Durable Run Lifecycle (`devkitd`)** | `rust/crates/devkit-core/src/store/durable.rs`, `rust/crates/devkitd/src/durable.rs`, `rust/crates/devkit-core/src/durable_process.rs`, `rust/crates/devkit-harness/src/start_profiles.rs` | **High** | Daemon-only (CLI requires capability v1; no legacy fallback) | `analysis/DurableRun.tla` |
| 1b | **Durable Agent Repository (TS)** | `packages/agent-manager/src/durable/DurableAgentRepository.ts`, `packages/agent-manager/src/harnesses/claude/durable/ClaudePrintAgentService.ts` | **High** | Still shipped in `@ai-devkit/agent-manager` | `analysis/DurableRepoTS.tla` |
| 2 | **Agent Registry + Concurrent Sweeps + Legacy `agents.db` Bridge** | `rust/crates/devkit-core/src/store.rs`, `rust/crates/devkit-core/src/store/registry.rs`, `rust/crates/devkitd/src/server.rs`, `rust/crates/devkitd/src/rpc/agent/{start,lookup,rename,unregister}.rs` | **High** | Active cross-DB dual-write & delta-import bridge | `analysis/AgentRegistrySweep.tla` |
| 3 | **Session Mapping + Adapter Registry Caches** | `rust/crates/devkit-core/src/session_map.rs`, `rust/crates/devkit-harness/src/{pi,codex}/mod.rs`, `rust/crates/devkit-harness/src/shared.rs`, `packages/pi-session-tracker/extensions/index.ts`, `hooks/codex/codex-session-mapping.cjs`, `packages/agent-manager/src/utils/AgentRegistry.ts` | **High** | Shipped (note actual stage order: `mapping → cache → locator`) | `analysis/SessionMappingCache.tla` |
| 4 | **Daemon Autostart & Socket Ownership** | `packages/daemon-client/src/autostart.ts`, `rust/crates/devkitd/src/main.rs`, `rust/crates/devkitd/src/server.rs` | **High** | Shipped | `analysis/DaemonAutostart.tla` |
| 5 | **Groups CRUD & Group Send** | `rust/crates/devkit-core/src/store/groups.rs`, `rust/crates/devkitd/src/rpc/group.rs`, `packages/cli/src/services/agent/agent-group.service.ts` | **Low** | Cut over to daemon-only (import fence & JSON fallback removed) | Audited |
| 6 | **Event Subscription Replay / Broadcast & Channel Bridge** | `rust/crates/devkitd/src/server.rs:498-584`, `packages/cli/src/services/channel/{channel-runner,channel.service}.ts` | **Low–Med** | Shipped (`emit_mutex` + subscribe-before-replay safe; bridge JSON RMW unlocked) | Audited |
| 7 | **Scheduled Sends** | Issue #482 (unimplemented) | N/A | Excluded per brief | — |

### TLC Model-Checking Statistics (TLC 2.19, Java 21)

| Model | Bounds | Invariant(s) | States Gen. | Distinct | Depth | Outcome |
|---|---|---|---:|---:|---:|---|
| `DurableRun.tla` | 2 tokens, 2 PIDs, 2 gens, 1 restart | `Inv_AtMostOneRunningRun`, `Inv_AgentStateMatchesActiveToken`, `Inv_ActiveTokenIsRunning`, `Inv_AtMostOneAliveProvider` | 3,322,522 | 1,004,842 | 28 | **PASS** (17s) |
| `DurableRun.tla` | same | `Inv_NoResumeUninitialized` | 22 | 22 | 3 | **VIOLATED** (Bug #4) |
| `DurableRun.tla` | same | `Inv_NoFastExitMarkedFailed` | 24 | 23 | 5 | **VIOLATED** (Bug #5) |
| `DurableRun.tla` | same | `Inv_StopReturnsNonRunning` | 3,836 | 2,092 | 6 | **VIOLATED** (Bug #6) |
| `DurableRun.tla` | same | `Inv_NoKillUnrelatedProcess` | 18,719 | 9,524 | 8 | **VIOLATED** (Bug #11) |
| `DurableRepoTS.tla` | 2 callers (`c1`, `c2`) | `Inv_AtMostOneLiveProvider`, `Inv_LiveProviderNotClobbered` | 136 | 98 | 10 | **VIOLATED** (Bug #7) |
| `AgentRegistrySweep.tla` | 1 PID, 1 name, 2 gens | `Inv_UniqueDbNames` | 37,697 | 10,732 | 23 | **PASS** (1s) |
| `AgentRegistrySweep.tla` | same | `Inv_NoPhantomDisappeared` | 54 | 39 | 4 | **VIOLATED** (**Live #1**) |
| `AgentRegistrySweep.tla` | same | `Inv_NoStaleEnrichedOverwrite` | 111 | 76 | 5 | **VIOLATED** (**Live #1**) |
| `AgentRegistrySweep.tla` | same | `Inv_NoResurrectedUnregName` | 464 | 272 | 7 | **VIOLATED** (Bug #8) |
| `SessionMappingCache.tla` (v2) | 2 PIDs, 2 sessions | `Inv_NoLostSessionsJsonEntry` | 1,093 | 486 | 7 | **VIOLATED** (**Live #2**) |
| `SessionMappingCache.tla` (v2) | same | `Inv_NoSessionRegression` | 10,839 | 5,024 | 10 | **VIOLATED** (Bug #9) |
| `SessionMappingCache.tla` (v2) | same | `Inv_NoStalePidCrossSession` | 4,923 | 2,216 | 9 | **VIOLATED** (Bug #10) |
| `DaemonAutostart.tla` (v2) | 2 clients, 2 daemons | `Inv_AtMostOneLiveDaemon` | 63 | 51 | 6 | **VIOLATED** (**Live #3**) |
| `DaemonAutostart.tla` (v2) | same | `Inv_NeverUnlinkLiveSocket` | 226 | 134 | 10 | **VIOLATED** (**Live #3**) |

---

## 3. Additional Confirmed Real Bugs (Beyond the 3 Live-Symptom Violations)

| # | Severity | Model / Invariant | Code (`file:line`) | Concrete Interleaving & Fix Direction |
|---|---|---|---|---|
| **4** | **High** | `DurableRun.tla` / `Inv_NoResumeUninitialized` | `rust/crates/devkitd/src/durable.rs:86,99-106,118-119`, `rust/crates/devkit-harness/src/start_profiles.rs:215-235`, `packages/agent-manager/src/harnesses/claude/durable/ClaudePrintAgentService.ts:71` | A `claude` or `pi` durable agent starts with `session_health = "uninitialized"`. If Run #1 fails to spawn (or fails before creating a session), `durable_complete` sets `session_health = "unknown"`. Every subsequent run checks `sessionHealth == "uninitialized"` → `false`, permanently passing `--resume <sid>` / `--session <sid>` for a session that never existed. **Fix**: Preserve `"uninitialized"` on pre-spawn failure or track an explicit `session_initialized` flag. |
| **5** | **Med–High** | `DurableRun.tla` / `Inv_NoFastExitMarkedFailed` | `rust/crates/devkitd/src/durable.rs:110-121`, `rust/crates/devkit-core/src/durable_process.rs:32-34` | If a spawned provider exits before `identity(pid)` runs, Linux `/proc/<pid>/stat` shows zombie `Z`, so `identity()` returns `Ok(None)`. `launch()` kills/waits the child, discards stdout & exit code, and marks even a valid exit-0 run `"failed"`. **Fix**: On `Ok(None)` for an owned `Child`, still hand off to `supervise_child` / check `try_wait()` + parse stdout. |
| **6** | **Medium** | `DurableRun.tla` / `Inv_StopReturnsNonRunning` | `rust/crates/devkitd/src/durable.rs:238-255` | `durable.stop` on a daemon-owned run (`is_owned == true`) kills the provider, waits until `matches()` is `false`, skips `durable_complete` (delegated to `supervise_child`), and immediately returns `durable_resolve(id)` — returning `state: "running"` while `supervise_child` is still finishing. Immediate `durable.run` fails `busy`. **Fix**: Wait on a per-token completion condvar/notify signaled by `supervise_child` before returning. |
| **7** | **High** | `DurableRepoTS.tla` / `Inv_LiveProviderNotClobbered` | `packages/agent-manager/src/durable/DurableAgentRepository.ts:150-198,317-343` | Caller `c2` snapshots `c1`'s run while `active_provider_pid IS NULL`; `c1` calls `recordProviderProcess` and then exits/crashes while its provider keeps running; `c2` evaluates `isActive(stale_observed)` → `false` and commits `UPDATE ... WHERE active_run_token=? AND active_owner_started_at=? AND active_run_started_at=?` without checking `active_provider_pid IS NULL`. Clobbers the live provider run (both `acquireRun` and `reconcile`). **Fix**: Check `active_provider_pid IS NULL` (or match provider columns / re-run `isActive`) inside `BEGIN IMMEDIATE`. |
| **8** | **Med–High** | `AgentRegistrySweep.tla` / `Inv_NoResurrectedUnregName` | `rust/crates/devkitd/src/rpc/agent/lookup.rs:38-54`, `rust/crates/devkitd/src/rpc/agent/unregister.rs:16-23`, `rust/crates/devkit-core/src/store/registry.rs:196-230` | `agent.lookup` does not hold `start_mutex` and calls `import_legacy_agents()`, which reads `agents.db` (`L197`) *before* locking `daemon.db` (`L199`). Interleaving with `agent.unregister` (deletes `daemon.db` at L20, then `agents.db` at L22) causes `lookup`'s `INSERT OR IGNORE` to resurrect the deleted registration into `daemon.db` as a tombstone. **Fix**: Serialize legacy bridge reads/writes with `daemon.db` mutations and delete from `agents.db` first. |
| **9** | **Medium** | `SessionMappingCache.tla` / `Inv_NoSessionRegression` | `rust/crates/devkit-harness/src/pi/mod.rs:45,200-227`, `rust/crates/devkit-harness/src/codex/mod.rs:182,311-355`, `packages/agent-manager/src/utils/AgentRegistry.ts:145` | Both Rust and TS adapters run `1. sessions.json → 2. agents.db cache → 3. locator`. When a live Pi/Codex process restarts in-place into `"ephemeral"`, `sessions.json` records `"ephemeral"`, which Stage 1 skips as untrusted/non-existent, falling through to Stage 2 (`agents.db`) and permanently regressing the live PID back to its dead pre-restart session file. **Fix**: Treat `"ephemeral"` in `sessions.json` as an authoritative negative match (skip Stage 2 & 3). |
| **10** | **Medium** | `SessionMappingCache.tla` / `Inv_NoStalePidCrossSession` | `rust/crates/devkit-harness/src/shared.rs:621-645`, `packages/agent-manager/src/harnesses/pi/PiAdapter.ts:136-158`, `packages/agent-manager/src/harnesses/codex/CodexAdapter.ts:268-295` | Stage 2 (`registry_session_paths` / `mapRegistryCache`) keys `agents.db` by `(type, pid)` with **no `start_time_ms` check**. On PID reuse before `agents.db`'s 30s prune (`AgentRegistry.ts:54`), a new process without a `sessions.json` entry is silently attributed to the dead process's transcript. **Fix**: Validate `start_time_ms` against the observed process (or source the cache from `daemon.db`, which already enforces `(pid, start_time_ms)` identity). |
| **11** | **Low–Med** | `DurableRun.tla` / `Inv_NoKillUnrelatedProcess` | `rust/crates/devkitd/src/durable.rs:209-236,300` | `stop()` drops `children` lock before calling `matches()?` and `libc::kill`. Between `matches()` and `kill()`, `supervise_child`'s `child.wait()` (or init for adopted runs) can reap the PID and OS can recycle it. Narrow window in practice. **Fix**: Use `pidfd_open` + `pidfd_send_signal` on Linux and synchronize owned-run reaping with `stop()`. |

---

## 4. Modeling Artifacts & Ruled-Out Candidates

1. **Initial `SessionMappingCache` v1 false positives (Fixed in v2)**:
   - v1 flagged `Inv_NoSessionRegression` and `Inv_NoStalePidCrossSession` during normal eventual consistency (between `InPlaceSessionRestart` and `HookWriteJson` completing, and on `procGen = 1` vs initial `resolvedGen = 0`). Fixed in v2 by gating regression on `hookCommitted[p] = TRUE` and PID reuse on `procGen[p] = 2`.
2. **`devkitd` Durable Core Invariants — PROVEN SAFE (`DurableRun.tla`, 1,004,842 distinct states)**:
   - `Inv_AtMostOneRunningRun`, `Inv_AgentStateMatchesActiveToken`, `Inv_ActiveTokenIsRunning`, and `Inv_AtMostOneAliveProvider` hold across restarts, adoption, stop, and reconcile.
3. **`daemon.db` Unique Name Invariant — PROVEN SAFE (`AgentRegistrySweep.tla`, 10,732 distinct states)**:
   - `Inv_UniqueDbNames` holds via `idx_agents_name`.
4. **Groups & Durable CLI Import Fences — Ruled Out (Already Cut Over)**:
   - Both `agent-group.service.ts` and `durable-agent.service.ts` require a capable daemon with no legacy fallback or import fence remaining.
5. **Event Subscribe Replay → Live Gap — Ruled Out**:
   - `emit_mutex` (`server.rs:92-106`) and subscribe-before-replay with monotonic `last_delivered` (`server.rs:508-525`) prevent dropped or duplicate events.

---

## 5. Recommended Structural Guards & Runtime Invariants

1. **Daemon singleton `flock` (`~/.ai-devkit/daemon.lock`)** acquired before `Daemon::new()` / `apply_sweep()` / `serve()`, plus binding `daemon.sock` before warm-up sweep.
2. **`Daemon::sweep_mutex`** (or monotonic sweep generation check) serializing `apply_sweep()` across the 2s timer and RPC handlers (`agent.start`, `agent.rename`).
3. **Per-PID atomic session mapping files** (`sessions/<pid>.json` via temp+rename) replacing shared `sessions.json`, plus explicit `"ephemeral"` negative matching and `start_time_ms` validation on any session cache hit.
4. **Preserve `session_health = "uninitialized"`** on pre-spawn durable launch failures (or add explicit `session_initialized` column).
5. **Check `active_provider_pid IS NULL`** inside `BEGIN IMMEDIATE` in TS `DurableAgentRepository.acquireRun` and `reconcile`.
6. **Serialize `daemon.db ↔ agents.db` bridge operations** and delete legacy rows *before* deleting daemon rows on `agent.unregister`.
