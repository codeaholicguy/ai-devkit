---------------------------- MODULE DurableRun ----------------------------
(*
  Formal TLA+ model of devkitd's DurableSupervisor + SQLite durable_agents /
  durable_runs state machine.

  Source code modeled:
    - rust/crates/devkit-core/src/store/durable.rs
    - rust/crates/devkitd/src/durable.rs
    - rust/crates/devkit-core/src/durable_process.rs
    - rust/crates/devkit-harness/src/start_profiles.rs

  Actors:
    - Launcher RPC (durable.run / durable.send)
    - Stopper RPC (durable.stop)
    - Reconcile (periodic 2s sweep & RPC pre-hook)
    - SuperviseChild waiter thread (spawned per launched run)
    - OS Process environment (provider exit -> zombie -> reaped -> PID reuse)
    - Daemon crash & restart (drops in-memory `children` & waiter threads)
*)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Tokens,     \* e.g. {"t1", "t2"}
  Pids,       \* e.g. {"p1", "p2"}
  Gens,       \* Process start-time identities, e.g. {1, 2}
  MaxRestarts \* Bound daemon restarts for finite state space

NULL == "NULL"

VARIABLES
  \* --- SQLite durable_agents (single Claude durable agent) ---
  agentState,        \* "ready" | "running" | "degraded"
  sessionHealth,     \* "uninitialized" | "healthy" | "unknown" | "mismatch"
  sessionCreated,    \* Ghost var: has provider actually created session on disk?
  activeToken,       \* NULL \cup Tokens
  lastToken,         \* NULL \cup Tokens

  \* --- SQLite durable_runs[t] ---
  runStatus,         \* [Tokens -> {"none", "running", "succeeded", "failed", "interrupted"}]
  runProviderPid,    \* [Tokens -> {NULL} \cup Pids]
  runProviderGen,    \* [Tokens -> {NULL} \cup Gens]
  runStopReq,        \* [Tokens -> BOOLEAN]
  runExitCode,       \* [Tokens -> {NULL, 0, 1}]

  \* --- In-memory devkitd DurableSupervisor ---
  children,          \* SUBSET Tokens (protected by children mutex)
  restarts,          \* 0..MaxRestarts

  \* --- SuperviseChild waiter threads (one per token in current daemon) ---
  \* "idle" | "running" | "waited" | "completed"
  waiterPc,          \* [Tokens -> {"idle", "running", "waited", "completed"}]
  waiterPid,         \* [Tokens -> {NULL} \cup Pids]
  waiterOutcome,     \* [Tokens -> {"none", "ok", "err", "sig"}]

  \* --- Stopper RPC (single in-flight durable.stop modeled with fine steps) ---
  \* "idle" | "checking" | "signaling" | "finishing"
  stopPc,
  stopToken,         \* captured token
  stopPid,           \* captured provider pid
  stopGen,           \* captured provider started_at
  stopIsOwned,       \* captured owned.contains(token)
  stopMatched,       \* result of matches()? before kill

  \* --- OS Process Table (for each pid in Pids) ---
  \* status: "free" | "alive_provider" | "zombie_provider" | "alive_unrelated"
  procStatus,        \* [Pids -> {"free", "alive_provider", "zombie_provider", "alive_unrelated"}]
  procGen,           \* [Pids -> {NULL} \cup Gens]
  procOwnerToken,    \* [Pids -> {NULL} \cup Tokens] (ghost: which durable run spawned it)
  procExitResult,    \* [Pids -> {"none", "ok", "err", "sig"}]

  \* --- Ghost telemetry / bug-detection flags ---
  killedUnrelated,        \* TRUE if stop() signaled an unrelated reused PID
  stopReturnedRunning,    \* TRUE if stop() returned Ok with state="running" after provider dead
  resumedUninitialized,   \* TRUE if launch passed --resume when session was never created
  fastExitMarkedFailed,   \* TRUE if a clean exit-0 provider was marked failed due to zombie identity
  usedTokens              \* SUBSET Tokens already allocated

vars == <<
  agentState, sessionHealth, sessionCreated, activeToken, lastToken,
  runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
  children, restarts,
  waiterPc, waiterPid, waiterOutcome,
  stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
  procStatus, procGen, procOwnerToken, procExitResult,
  killedUnrelated, stopReturnedRunning, resumedUninitialized,
  fastExitMarkedFailed, usedTokens
>>

\* Matches rust/crates/devkit-core/src/durable_process.rs:identity(pid)
\* Returns TRUE iff pid is alive (NOT zombie/free) and its gen equals expectedGen.
IdentityMatches(p, expectedGen) ==
  /\ p \in Pids
  /\ expectedGen \in Gens
  /\ procStatus[p] \in {"alive_provider", "alive_unrelated"}
  /\ procGen[p] = expectedGen

\* Any alive provider process currently running in OS
AliveProviderPids == { p \in Pids : procStatus[p] = "alive_provider" }

Init ==
  /\ agentState = "ready"
  /\ sessionHealth = "uninitialized"
  /\ sessionCreated = FALSE
  /\ activeToken = NULL
  /\ lastToken = NULL
  /\ runStatus = [t \in Tokens |-> "none"]
  /\ runProviderPid = [t \in Tokens |-> NULL]
  /\ runProviderGen = [t \in Tokens |-> NULL]
  /\ runStopReq = [t \in Tokens |-> FALSE]
  /\ runExitCode = [t \in Tokens |-> NULL]
  /\ children = {}
  /\ restarts = 0
  /\ waiterPc = [t \in Tokens |-> "idle"]
  /\ waiterPid = [t \in Tokens |-> NULL]
  /\ waiterOutcome = [t \in Tokens |-> "none"]
  /\ stopPc = "idle"
  /\ stopToken = NULL
  /\ stopPid = NULL
  /\ stopGen = NULL
  /\ stopIsOwned = FALSE
  /\ stopMatched = FALSE
  /\ procStatus = [p \in Pids |-> "free"]
  /\ procGen = [p \in Pids |-> NULL]
  /\ procOwnerToken = [p \in Pids |-> NULL]
  /\ procExitResult = [p \in Pids |-> "none"]
  /\ killedUnrelated = FALSE
  /\ stopReturnedRunning = FALSE
  /\ resumedUninitialized = FALSE
  /\ fastExitMarkedFailed = FALSE
  /\ usedTokens = {}

-----------------------------------------------------------------------------
(* Action 1: durable.run / durable.send -> launch()
   rust/crates/devkitd/src/durable.rs:76-159
   Holds children.lock() across acquire -> args -> spawn -> identity -> record_process -> insert.
*)

\* 1a. Launch fails at spawn (e.g. missing binary / ENOENT): durable.rs:98-108
\*     Calls durable_complete(id, token, "failed", None, ..., "unknown")
LaunchSpawnFail(t) ==
  /\ t \in Tokens \ usedTokens
  /\ activeToken = NULL
  /\ usedTokens' = usedTokens \cup {t}
  \* durable_args checks sessionHealth == "uninitialized": durable.rs:86
  /\ resumedUninitialized' = (resumedUninitialized \/ (sessionHealth # "uninitialized" /\ ~sessionCreated))
  \* acquire + complete("failed", "unknown") atomically under children lock:
  /\ agentState' = "degraded"
  /\ sessionHealth' = "unknown"
  /\ activeToken' = NULL
  /\ lastToken' = t
  /\ runStatus' = [runStatus EXCEPT ![t] = "failed"]
  /\ runExitCode' = [runExitCode EXCEPT ![t] = NULL]
  /\ UNCHANGED <<sessionCreated, runProviderPid, runProviderGen, runStopReq,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning, fastExitMarkedFailed>>

\* 1b. Launch spawns child, child exits cleanly (exit 0) BEFORE identity(pid) runs!
\*     durable.rs:110-121 & durable_process.rs:32-34 (zombie -> identity returns None)
LaunchFastExitBeforeIdentity(t) ==
  /\ t \in Tokens \ usedTokens
  /\ activeToken = NULL
  /\ usedTokens' = usedTokens \cup {t}
  /\ resumedUninitialized' = (resumedUninitialized \/ (sessionHealth # "uninitialized" /\ ~sessionCreated))
  /\ fastExitMarkedFailed' = TRUE
  \* Child already exited & reaped by child.wait() at durable.rs:117; marked failed!
  /\ agentState' = "degraded"
  /\ sessionHealth' = "unknown"
  /\ activeToken' = NULL
  /\ lastToken' = t
  /\ runStatus' = [runStatus EXCEPT ![t] = "failed"]
  /\ runExitCode' = [runExitCode EXCEPT ![t] = NULL]
  /\ UNCHANGED <<sessionCreated, runProviderPid, runProviderGen, runStopReq,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning>>

\* 1c. Launch succeeds: acquire -> spawn -> identity -> record_process -> insert(t) -> spawn waiter
LaunchSuccess(t, p, g) ==
  /\ t \in Tokens \ usedTokens
  /\ activeToken = NULL
  /\ p \in Pids
  /\ procStatus[p] = "free"
  /\ g \in Gens
  /\ g # procGen[p]  \* new OS start_time differs from previous occupant of pid p
  /\ usedTokens' = usedTokens \cup {t}
  /\ resumedUninitialized' = (resumedUninitialized \/ (sessionHealth # "uninitialized" /\ ~sessionCreated))
  /\ agentState' = "running"
  /\ activeToken' = t
  /\ runStatus' = [runStatus EXCEPT ![t] = "running"]
  /\ runProviderPid' = [runProviderPid EXCEPT ![t] = p]
  /\ runProviderGen' = [runProviderGen EXCEPT ![t] = g]
  /\ runStopReq' = [runStopReq EXCEPT ![t] = FALSE]
  /\ runExitCode' = [runExitCode EXCEPT ![t] = NULL]
  /\ children' = children \cup {t}
  /\ waiterPc' = [waiterPc EXCEPT ![t] = "running"]
  /\ waiterPid' = [waiterPid EXCEPT ![t] = p]
  /\ waiterOutcome' = [waiterOutcome EXCEPT ![t] = "none"]
  /\ procStatus' = [procStatus EXCEPT ![p] = "alive_provider"]
  /\ procGen' = [procGen EXCEPT ![p] = g]
  /\ procOwnerToken' = [procOwnerToken EXCEPT ![p] = t]
  /\ procExitResult' = [procExitResult EXCEPT ![p] = "none"]
  /\ UNCHANGED <<sessionHealth, sessionCreated, lastToken, restarts,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 killedUnrelated, stopReturnedRunning, fastExitMarkedFailed>>

-----------------------------------------------------------------------------
(* Action 2: OS Process Environment *)

\* Provider finishes normally (ok or err) -> becomes zombie (if parent devkitd alive)
\* or immediately reaped by init/PID1 (if adopted run after daemon restart)
ProviderExit(p, res) ==
  /\ p \in Pids
  /\ procStatus[p] = "alive_provider"
  /\ res \in {"ok", "err"}
  /\ LET t == procOwnerToken[p]
         hasParent == (t \in children)
     IN
       /\ IF res = "ok" THEN sessionCreated' = TRUE ELSE sessionCreated' = sessionCreated
       /\ IF hasParent THEN
            /\ procStatus' = [procStatus EXCEPT ![p] = "zombie_provider"]
            /\ procExitResult' = [procExitResult EXCEPT ![p] = res]
          ELSE
            \* Adopted process: reparented to init, reaped immediately on exit
            /\ procStatus' = [procStatus EXCEPT ![p] = "free"]
            /\ procOwnerToken' = [procOwnerToken EXCEPT ![p] = NULL]
            /\ procExitResult' = [procExitResult EXCEPT ![p] = "none"]
       /\ IF hasParent THEN UNCHANGED procOwnerToken ELSE TRUE
  /\ UNCHANGED <<agentState, sessionHealth, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procGen,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

\* OS reuses a free PID for an unrelated process (new generation)
OSReusePid(p, g) ==
  /\ p \in Pids
  /\ procStatus[p] = "free"
  /\ g \in Gens
  /\ g # procGen[p]
  /\ procStatus' = [procStatus EXCEPT ![p] = "alive_unrelated"]
  /\ procGen' = [procGen EXCEPT ![p] = g]
  /\ procOwnerToken' = [procOwnerToken EXCEPT ![p] = NULL]
  /\ procExitResult' = [procExitResult EXCEPT ![p] = "none"]
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

-----------------------------------------------------------------------------
(* Action 3: SuperviseChild waiter thread
   rust/crates/devkitd/src/durable.rs:274-327
*)

\* 3a. Waiter calls child.wait() — reaps zombie child (freeing PID for OS reuse!)
WaiterReap(t) ==
  /\ t \in Tokens
  /\ waiterPc[t] = "running"
  /\ LET p == waiterPid[t] IN
     /\ p \in Pids
     /\ procStatus[p] = "zombie_provider"
     /\ procOwnerToken[p] = t
     /\ waiterPc' = [waiterPc EXCEPT ![t] = "waited"]
     /\ waiterOutcome' = [waiterOutcome EXCEPT ![t] = procExitResult[p]]
     /\ procStatus' = [procStatus EXCEPT ![p] = "free"]
     /\ procOwnerToken' = [procOwnerToken EXCEPT ![p] = NULL]
     /\ procExitResult' = [procExitResult EXCEPT ![p] = "none"]
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 children, restarts, waiterPid,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procGen,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

\* 3b. Waiter calls store.durable_complete() (WITHOUT children mutex!)
\*     durable.rs:320-325 & store/durable.rs:227-267
WaiterComplete(t) ==
  /\ t \in Tokens
  /\ waiterPc[t] = "waited"
  /\ waiterPc' = [waiterPc EXCEPT ![t] = "completed"]
  /\ IF activeToken = t /\ runStatus[t] = "running" THEN
       LET stopped == runStopReq[t]
           rawStatus == CASE waiterOutcome[t] = "ok" -> "succeeded"
                          [] waiterOutcome[t] = "sig" -> "interrupted"
                          [] OTHER -> "failed"
           rawHealth == IF waiterOutcome[t] = "ok" THEN "healthy" ELSE "unknown"
           finalStatus == IF stopped THEN "interrupted" ELSE rawStatus
           finalHealth == IF stopped THEN "unknown" ELSE rawHealth
           code == CASE waiterOutcome[t] = "ok" -> "0"
                     [] waiterOutcome[t] = "err" -> "1"
                     [] OTHER -> NULL
       IN
         /\ runStatus' = [runStatus EXCEPT ![t] = finalStatus]
         /\ runExitCode' = [runExitCode EXCEPT ![t] = code]
         /\ agentState' = IF finalStatus = "succeeded" THEN "ready" ELSE "degraded"
         /\ sessionHealth' = finalHealth
         /\ activeToken' = NULL
         /\ lastToken' = t
     ELSE
       UNCHANGED <<agentState, sessionHealth, activeToken, lastToken, runStatus, runExitCode>>
  /\ UNCHANGED <<sessionCreated, runProviderPid, runProviderGen, runStopReq,
                 children, restarts, waiterPid, waiterOutcome,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

\* 3c. Waiter removes token from owned children set: durable.rs:326
WaiterRemoveOwned(t) ==
  /\ t \in Tokens
  /\ waiterPc[t] = "completed"
  /\ children' = children \ {t}
  /\ waiterPc' = [waiterPc EXCEPT ![t] = "idle"]
  /\ waiterPid' = [waiterPid EXCEPT ![t] = NULL]
  /\ waiterOutcome' = [waiterOutcome EXCEPT ![t] = "none"]
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 restarts,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

-----------------------------------------------------------------------------
(* Action 4: Reconcile
   rust/crates/devkitd/src/durable.rs:160-189
   Holds children.lock(). Skips tokens in `children` or with live matching provider.
*)
Reconcile ==
  /\ activeToken # NULL
  /\ activeToken \notin children
  /\ LET t == activeToken
         p == runProviderPid[t]
         g == runProviderGen[t]
     IN
       /\ ~(p # NULL /\ IdentityMatches(p, g))
       /\ runStatus' = [runStatus EXCEPT ![t] = "interrupted"]
       /\ runExitCode' = [runExitCode EXCEPT ![t] = NULL]
       /\ agentState' = "degraded"
       /\ sessionHealth' = "unknown"
       /\ activeToken' = NULL
       /\ lastToken' = t
  /\ UNCHANGED <<sessionCreated, runProviderPid, runProviderGen, runStopReq,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopPc, stopToken, stopPid, stopGen, stopIsOwned, stopMatched,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

-----------------------------------------------------------------------------
(* Action 5: durable.stop RPC (broken into actual lock/unlocked steps!)
   rust/crates/devkitd/src/durable.rs:190-255
*)

\* 5a. Under children.lock(): resolve activeRun, set stop_requested=1, capture
\*     (token, pid, started_at, is_owned), then RELEASE children.lock() (line 209).
StopStart ==
  /\ stopPc = "idle"
  /\ activeToken # NULL
  /\ runProviderPid[activeToken] # NULL
  /\ LET t == activeToken IN
     /\ runStopReq' = [runStopReq EXCEPT ![t] = TRUE]
     /\ stopToken' = t
     /\ stopPid' = runProviderPid[t]
     /\ stopGen' = runProviderGen[t]
     /\ stopIsOwned' = (t \in children)
     /\ stopPc' = "checking"
     /\ stopMatched' = FALSE
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runExitCode,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

\* 5b. Outside lock (line 213): check matches()?
StopCheckMatch ==
  /\ stopPc = "checking"
  /\ IF IdentityMatches(stopPid, stopGen) THEN
       /\ stopMatched' = TRUE
       /\ stopPc' = "signaling"
     ELSE
       /\ stopMatched' = FALSE
       /\ stopPc' = "finishing"
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopToken, stopPid, stopGen, stopIsOwned,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

\* 5c. Outside lock (line 222/230): send SIGTERM/SIGKILL to stopPid!
\*     TOCTOU window: between StopCheckMatch and StopSignal, stopPid may have
\*     exited, been reaped, and been reused by an unrelated process!
StopSignal ==
  /\ stopPc = "signaling"
  /\ stopPc' = "finishing"
  /\ CASE procStatus[stopPid] = "alive_provider" ->
            LET t == procOwnerToken[stopPid]
                hasParent == (t \in children)
            IN
              /\ IF hasParent THEN
                   /\ procStatus' = [procStatus EXCEPT ![stopPid] = "zombie_provider"]
                   /\ procExitResult' = [procExitResult EXCEPT ![stopPid] = "sig"]
                   /\ UNCHANGED procOwnerToken
                 ELSE
                   /\ procStatus' = [procStatus EXCEPT ![stopPid] = "free"]
                   /\ procOwnerToken' = [procOwnerToken EXCEPT ![stopPid] = NULL]
                   /\ procExitResult' = [procExitResult EXCEPT ![stopPid] = "none"]
              /\ UNCHANGED killedUnrelated
       [] procStatus[stopPid] = "alive_unrelated" ->
            \* BUG: signaled an unrelated process that reused stopPid!
            /\ killedUnrelated' = TRUE
            /\ procStatus' = [procStatus EXCEPT ![stopPid] = "free"]
            /\ UNCHANGED <<procOwnerToken, procExitResult>>
       [] OTHER ->
            \* Already zombie or free -> kill(pid, SIG) is a no-op / ESRCH
            UNCHANGED <<procStatus, procOwnerToken, procExitResult, killedUnrelated>>
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 stopToken, stopPid, stopGen, stopIsOwned, stopMatched, procGen,
                 stopReturnedRunning, resumedUninitialized, fastExitMarkedFailed, usedTokens>>

\* 5d. Line 239-254: if !is_owned && !matches()? -> durable_complete; then durable_resolve(id)
StopFinish ==
  /\ stopPc = "finishing"
  /\ LET stillAlive == IdentityMatches(stopPid, stopGen)
         willComplete == (~stopIsOwned /\ ~stillAlive /\ activeToken = stopToken /\ runStatus[stopToken] = "running")
         nextAgentState == IF willComplete THEN "degraded" ELSE agentState
     IN
       /\ IF willComplete THEN
            /\ runStatus' = [runStatus EXCEPT ![stopToken] = "interrupted"]
            /\ runExitCode' = [runExitCode EXCEPT ![stopToken] = NULL]
            /\ agentState' = "degraded"
            /\ sessionHealth' = "unknown"
            /\ activeToken' = NULL
            /\ lastToken' = stopToken
          ELSE
            UNCHANGED <<agentState, sessionHealth, activeToken, lastToken, runStatus, runExitCode>>
       \* Check what durable.stop returns at line 254 when provider is dead!
       /\ stopReturnedRunning' = (stopReturnedRunning \/ (~stillAlive /\ nextAgentState = "running" /\ activeToken = stopToken))
  /\ stopPc' = "idle"
  /\ stopToken' = NULL
  /\ stopPid' = NULL
  /\ stopGen' = NULL
  /\ stopIsOwned' = FALSE
  /\ stopMatched' = FALSE
  /\ UNCHANGED <<sessionCreated, runProviderPid, runProviderGen, runStopReq,
                 children, restarts, waiterPc, waiterPid, waiterOutcome,
                 procStatus, procGen, procOwnerToken, procExitResult,
                 killedUnrelated, resumedUninitialized, fastExitMarkedFailed, usedTokens>>

-----------------------------------------------------------------------------
(* Action 6: Daemon Crash & Restart
   Drops in-memory `children`, kills waiter threads & in-flight RPCs.
   Any zombie child of old daemon is reaped by init (becomes free).
   Surviving alive providers keep running (adopted by new daemon).
*)
DaemonRestart ==
  /\ restarts < MaxRestarts
  /\ restarts' = restarts + 1
  /\ children' = {}
  /\ waiterPc' = [t \in Tokens |-> "idle"]
  /\ waiterPid' = [t \in Tokens |-> NULL]
  /\ waiterOutcome' = [t \in Tokens |-> "none"]
  /\ stopPc' = "idle"
  /\ stopToken' = NULL
  /\ stopPid' = NULL
  /\ stopGen' = NULL
  /\ stopIsOwned' = FALSE
  /\ stopMatched' = FALSE
  \* Zombies of crashed daemon are reaped by PID 1
  /\ procStatus' = [p \in Pids |-> IF procStatus[p] = "zombie_provider" THEN "free" ELSE procStatus[p]]
  /\ procOwnerToken' = [p \in Pids |-> IF procStatus[p] = "zombie_provider" THEN NULL ELSE procOwnerToken[p]]
  /\ procExitResult' = [p \in Pids |-> IF procStatus[p] = "zombie_provider" THEN "none" ELSE procExitResult[p]]
  /\ UNCHANGED <<agentState, sessionHealth, sessionCreated, activeToken, lastToken,
                 runStatus, runProviderPid, runProviderGen, runStopReq, runExitCode,
                 procGen,
                 killedUnrelated, stopReturnedRunning, resumedUninitialized,
                 fastExitMarkedFailed, usedTokens>>

Next ==
  \/ \E t \in Tokens : LaunchSpawnFail(t)
  \/ \E t \in Tokens : LaunchFastExitBeforeIdentity(t)
  \/ \E t \in Tokens, p \in Pids, g \in Gens : LaunchSuccess(t, p, g)
  \/ \E p \in Pids, res \in {"ok", "err"} : ProviderExit(p, res)
  \/ \E p \in Pids, g \in Gens : OSReusePid(p, g)
  \/ \E t \in Tokens : WaiterReap(t)
  \/ \E t \in Tokens : WaiterComplete(t)
  \/ \E t \in Tokens : WaiterRemoveOwned(t)
  \/ Reconcile
  \/ StopStart
  \/ StopCheckMatch
  \/ StopSignal
  \/ StopFinish
  \/ DaemonRestart

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Invariants *)

\* Core SQLite / structural invariants (expected to HOLD)
Inv_AtMostOneRunningRun ==
  Cardinality({ t \in Tokens : runStatus[t] = "running" }) <= 1

Inv_AgentStateMatchesActiveToken ==
  (agentState = "running") <=> (activeToken # NULL)

Inv_ActiveTokenIsRunning ==
  activeToken # NULL => runStatus[activeToken] = "running"

Inv_AtMostOneAliveProvider ==
  Cardinality(AliveProviderPids) <= 1

\* Candidate bug invariants (expected to be TESTED by TLC!)
Inv_NoKillUnrelatedProcess == ~killedUnrelated
Inv_StopReturnsNonRunning == ~stopReturnedRunning
Inv_NoResumeUninitialized == ~resumedUninitialized
Inv_NoFastExitMarkedFailed == ~fastExitMarkedFailed

=============================================================================
