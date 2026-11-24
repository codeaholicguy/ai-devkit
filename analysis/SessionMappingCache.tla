------------------------ MODULE SessionMappingCache ------------------------
(*
  Refined TLA+ model of session mapping files (sessions.json) + adapter
  registry cache (agents.db) + daemon sweep attribution (PiAdapter / CodexAdapter).

  Refinement over v1: distinguishes genuine bugs from benign eventual-consistency
  delays between session restart and hook execution:
    - Inv_NoSessionRegression: violated ONLY when a live process whose hook has
      ALREADY updated sessions.json (to S2 or "ephemeral") resolves back to an
      older session S1 (either via ephemeral fallback to agents.db cache, or via
      concurrent RMW clobbering sessions.json).
    - Inv_NoStalePidCrossSession: violated ONLY on genuine PID reuse (procGen = 2)
      when the previous process cleanly exited (clearing sessions.json) yet the
      new process gets attributed to the dead process's session via agents.db cache
      (which lacks start_time_ms validation).
    - Inv_NoLostSessionsJsonEntry: violated when concurrent unlocked RMW by p2
      drops p1's committed entry from sessions.json.

  Source code modeled:
    - packages/pi-session-tracker/extensions/index.ts (lines 37-51)
    - hooks/codex/codex-session-mapping.cjs (lines 159-165)
    - rust/crates/devkit-harness/src/pi/mod.rs (lines 180-252)
    - rust/crates/devkit-harness/src/codex/mod.rs (lines 291-399)
    - rust/crates/devkit-harness/src/shared.rs (registry_session_paths:621-645)
    - packages/agent-manager/src/utils/AgentRegistry.ts (mergeEntry:131-147)
    - packages/agent-manager/src/AgentManager.ts (listAgents:320-342)
*)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Pids,     \* e.g. {"p1", "p2"}
  Sessions  \* e.g. {"s1", "s2"}

NULL == "NULL"
EPHEMERAL == "ephemeral"

VARIABLES
  \* --- Live OS processes (pi / codex) ---
  procAlive,       \* [Pids -> BOOLEAN]
  procGen,         \* [Pids -> {0, 1, 2}]
  procTrueSess,    \* [Pids -> {NULL, EPHEMERAL} \cup Sessions]
  hookCommitted,   \* [Pids -> BOOLEAN] (TRUE once hook finished writing procTrueSess)

  \* --- On-disk session files ---
  fileExists,      \* [Sessions -> BOOLEAN]

  \* --- Shared sessions.json ---
  sessJson,        \* [Pids -> {NULL, EPHEMERAL} \cup Sessions]

  \* --- Per-process unlocked RMW state ---
  rmwPc,           \* [Pids -> {"idle", "read_json"}]
  rmwSnap,         \* [Pids -> [Pids -> {NULL, EPHEMERAL} \cup Sessions]]
  rmwDesired,      \* [Pids -> {NULL, EPHEMERAL} \cup Sessions]

  \* --- Legacy agents.db cache (keyed ONLY by (type, pid), NO start_time_ms) ---
  regCache,        \* [Pids -> {NULL} \cup Sessions]

  \* --- Ghost bug-detection flags ---
  regressedAfterCommit,  \* TRUE if hookCommitted[p] is TRUE yet adapter resolves p to old session # procTrueSess[p]
  stalePidCrossSession,  \* TRUE if PID reused (procGen[p]=2), sessions.json has no file for p, yet adapter resolves to gen-1's session
  lostSessionsJsonEntry  \* TRUE if concurrent RMW dropped another live pid's committed entry

vars == <<
  procAlive, procGen, procTrueSess, hookCommitted, fileExists,
  sessJson, rmwPc, rmwSnap, rmwDesired,
  regCache,
  regressedAfterCommit, stalePidCrossSession, lostSessionsJsonEntry
>>

Init ==
  /\ procAlive = [p \in Pids |-> FALSE]
  /\ procGen = [p \in Pids |-> 0]
  /\ procTrueSess = [p \in Pids |-> NULL]
  /\ hookCommitted = [p \in Pids |-> FALSE]
  /\ fileExists = [s \in Sessions |-> FALSE]
  /\ sessJson = [p \in Pids |-> NULL]
  /\ rmwPc = [p \in Pids |-> "idle"]
  /\ rmwSnap = [p \in Pids |-> [q \in Pids |-> NULL]]
  /\ rmwDesired = [p \in Pids |-> NULL]
  /\ regCache = [p \in Pids |-> NULL]
  /\ regressedAfterCommit = FALSE
  /\ stalePidCrossSession = FALSE
  /\ lostSessionsJsonEntry = FALSE

\* Stage 1 (sessions.json: skips NULL & "ephemeral") -> Stage 2 (agents.db cache: no start_time check)
ResolvePid(p) ==
  IF sessJson[p] \in Sessions /\ fileExists[sessJson[p]] THEN sessJson[p]
  ELSE IF regCache[p] \in Sessions /\ fileExists[regCache[p]] THEN regCache[p]
  ELSE NULL

SpawnProcess(p, s) ==
  /\ ~procAlive[p]
  /\ procGen[p] < 2
  /\ s \in Sessions \cup {EPHEMERAL}
  /\ procAlive' = [procAlive EXCEPT ![p] = TRUE]
  /\ procGen' = [procGen EXCEPT ![p] = procGen[p] + 1]
  /\ procTrueSess' = [procTrueSess EXCEPT ![p] = s]
  /\ hookCommitted' = [hookCommitted EXCEPT ![p] = FALSE]
  /\ fileExists' = IF s \in Sessions THEN [fileExists EXCEPT ![s] = TRUE] ELSE fileExists
  /\ rmwPc' = [rmwPc EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<sessJson, rmwSnap, rmwDesired, regCache,
                 regressedAfterCommit, stalePidCrossSession, lostSessionsJsonEntry>>

InPlaceSessionRestart(p, s) ==
  /\ procAlive[p]
  /\ hookCommitted[p] \* only restart after current session was registered
  /\ rmwPc[p] = "idle"
  /\ s \in (Sessions \cup {EPHEMERAL}) \ {procTrueSess[p]}
  /\ procTrueSess' = [procTrueSess EXCEPT ![p] = s]
  /\ hookCommitted' = [hookCommitted EXCEPT ![p] = FALSE]
  /\ fileExists' = IF s \in Sessions THEN [fileExists EXCEPT ![s] = TRUE] ELSE fileExists
  /\ UNCHANGED <<procAlive, procGen, sessJson, rmwPc, rmwSnap, rmwDesired,
                 regCache, regressedAfterCommit, stalePidCrossSession, lostSessionsJsonEntry>>

HookReadJson(p) ==
  /\ procAlive[p]
  /\ rmwPc[p] = "idle"
  /\ ~hookCommitted[p]
  /\ procTrueSess[p] # NULL
  /\ rmwPc' = [rmwPc EXCEPT ![p] = "read_json"]
  /\ rmwSnap' = [rmwSnap EXCEPT ![p] = sessJson]
  /\ rmwDesired' = [rmwDesired EXCEPT ![p] = procTrueSess[p]]
  /\ UNCHANGED <<procAlive, procGen, procTrueSess, hookCommitted, fileExists, sessJson,
                 regCache, regressedAfterCommit, stalePidCrossSession, lostSessionsJsonEntry>>

HookWriteJson(p) ==
  /\ rmwPc[p] = "read_json"
  /\ LET nextJson == [rmwSnap[p] EXCEPT ![p] = rmwDesired[p]]
         droppedOther == \E q \in Pids : q # p /\ procAlive[q] /\ hookCommitted[q] /\ sessJson[q] \in Sessions /\ nextJson[q] # sessJson[q]
     IN
       /\ sessJson' = nextJson
       /\ lostSessionsJsonEntry' = (lostSessionsJsonEntry \/ droppedOther)
  /\ hookCommitted' = [hookCommitted EXCEPT ![p] = TRUE]
  /\ rmwPc' = [rmwPc EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<procAlive, procGen, procTrueSess, fileExists, rmwSnap, rmwDesired,
                 regCache, regressedAfterCommit, stalePidCrossSession>>

\* Clean exit clears sessions.json via session_shutdown hook (agents.db prune runs only every 30s!)
ProcessCleanExit(p) ==
  /\ procAlive[p]
  /\ rmwPc[p] = "idle"
  /\ procAlive' = [procAlive EXCEPT ![p] = FALSE]
  /\ procTrueSess' = [procTrueSess EXCEPT ![p] = NULL]
  /\ hookCommitted' = [hookCommitted EXCEPT ![p] = FALSE]
  /\ sessJson' = [sessJson EXCEPT ![p] = NULL]
  /\ UNCHANGED <<procGen, fileExists, rmwPc, rmwSnap, rmwDesired,
                 regCache, regressedAfterCommit, stalePidCrossSession, lostSessionsJsonEntry>>

SweepAndCacheUpdate ==
  /\ LET resolved == [p \in Pids |-> IF procAlive[p] THEN ResolvePid(p) ELSE NULL]
         \* Genuine regression: p already committed its new session (or ephemeral),
         \* yet adapter resolves p to a DIFFERENT session file!
         regressed == \E p \in Pids :
           /\ procAlive[p]
           /\ hookCommitted[p]
           /\ resolved[p] \in Sessions
           /\ resolved[p] # procTrueSess[p]
         \* Genuine PID reuse cross-session attribution: gen-2 process on reused PID
         \* has no sessions.json file entry, yet Stage 2 binds it to gen-1's session!
         crossPid == \E p \in Pids :
           /\ procAlive[p]
           /\ procGen[p] = 2
           /\ sessJson[p] \notin Sessions
           /\ resolved[p] \in Sessions
           /\ resolved[p] # procTrueSess[p]
     IN
       /\ regressedAfterCommit' = (regressedAfterCommit \/ regressed)
       /\ stalePidCrossSession' = (stalePidCrossSession \/ crossPid)
       \* AgentRegistry.mergeEntry (AgentRegistry.ts:145): incoming || existing
       /\ regCache' = [p \in Pids |->
            IF procAlive[p] /\ resolved[p] \in Sessions THEN resolved[p]
            ELSE regCache[p]]
  /\ UNCHANGED <<procAlive, procGen, procTrueSess, hookCommitted, fileExists,
                 sessJson, rmwPc, rmwSnap, rmwDesired, lostSessionsJsonEntry>>

Next ==
  \/ \E p \in Pids, s \in Sessions \cup {EPHEMERAL} : SpawnProcess(p, s)
  \/ \E p \in Pids, s \in Sessions \cup {EPHEMERAL} : InPlaceSessionRestart(p, s)
  \/ \E p \in Pids : HookReadJson(p)
  \/ \E p \in Pids : HookWriteJson(p)
  \/ \E p \in Pids : ProcessCleanExit(p)
  \/ SweepAndCacheUpdate

Spec == Init /\ [][Next]_vars

Inv_NoSessionRegression == ~regressedAfterCommit
Inv_NoStalePidCrossSession == ~stalePidCrossSession
Inv_NoLostSessionsJsonEntry == ~lostSessionsJsonEntry

=============================================================================
