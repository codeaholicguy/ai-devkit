------------------------ MODULE AgentRegistrySweep ------------------------
(*
  Formal TLA+ model of devkitd's Agent Registry + Legacy agents.db Bridge +
  Concurrent Sweeps (timer sweep + RPC-triggered sweep).

  Source code modeled:
    - rust/crates/devkit-core/src/store.rs (apply_agent_snapshot:155-255)
    - rust/crates/devkit-core/src/store/registry.rs
        (register_start:56-98, dual_write_legacy:104-139,
         import_legacy_agents:196-230, unregister:260-267,
         unregister_legacy:273-285, rename_registration:291-307,
         rename_legacy:313-341, prune_dead:345-362)
    - rust/crates/devkitd/src/server.rs (apply_sweep:240-316, vanished_pids:333-339)
    - rust/crates/devkitd/src/rpc/agent/start.rs (run_with:72-193)
    - rust/crates/devkitd/src/rpc/agent/unregister.rs (run:13-27)
    - rust/crates/devkitd/src/rpc/agent/lookup.rs (find:38-54)
    - packages/agent-manager/src/utils/AgentRegistry.ts (legacy writer)

  Note on ownership fences in 0.78.0:
    - Groups and durable agents have already completed daemon-only cutover
      (no local JSON/SQLite fallback or import fence remains).
    - The live cross-store bridge STILL in production is daemon.db <-> agents.db
      (import_legacy_agents + dual_write_legacy / unregister_legacy / rename_legacy)
      with NO fence preventing legacy TS writers or out-of-order bridge ops.
*)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Pids,     \* e.g. {"p1", "p2"}
  Names,    \* e.g. {"a"}
  Gens      \* e.g. {1, 2}

NULL == "NULL"

VARIABLES
  \* --- OS Process Table ---
  osAlive,         \* [Pids -> BOOLEAN]
  osGen,           \* [Pids -> {NULL} \cup Gens]

  \* --- daemon.db agents table (keyed by pid) ---
  dbPresent,       \* [Pids -> BOOLEAN]
  dbGen,           \* [Pids -> {NULL} \cup Gens]  (start_time_ms)
  dbName,          \* [Pids -> {NULL} \cup Names] (NULL = unnamed, non-NULL = registered)
  dbGone,          \* [Pids -> BOOLEAN]           (gone_at IS NOT NULL)

  \* --- daemon in-memory sweep state ---
  enrichedPids,    \* SUBSET Pids (self.enriched RwLock)
  sweptPids,       \* SUBSET Pids (self.swept_pids Mutex)

  \* --- legacy agents.db table (keyed by pid for single agent type) ---
  legacyName,      \* [Pids -> {NULL} \cup Names]

  \* --- Background Timer Sweep worker (server.rs:240-316, NO sweep_mutex!) ---
  \* "idle" | "snapshotted" | "enriched_written"
  swPc,
  swSnapAlive,     \* [Pids -> BOOLEAN] captured ps snapshot
  swSnapGen,       \* [Pids -> {NULL} \cup Gens]

  \* --- Concurrent agent.unregister RPC (holds start_mutex) ---
  \* "idle" | "unreg_daemon_done"  (between store.unregister and store.unregister_legacy!)
  unregPc,
  unregName,
  unregPid,

  \* --- Concurrent agent.lookup RPC (does NOT hold start_mutex! lookup.rs:38-54) ---
  \* "idle" | "read_legacy"  (between read_legacy_rows and conn.lock in import_legacy_agents!)
  lookupPc,
  lookupSnapLegacy, \* [Pids -> {NULL} \cup Names]

  \* --- Ghost bug-detection flags ---
  phantomDisappeared,     \* TRUE if live newly-started pid got phantom agent.disappeared + tombstoned
  resurrectedUnregName,   \* TRUE if unregistered name got resurrected into daemon.db by import_legacy_agents
  staleEnrichedOverwrite  \* TRUE if older sweep overwrote newer enriched cache

vars == <<
  osAlive, osGen,
  dbPresent, dbGen, dbName, dbGone,
  enrichedPids, sweptPids,
  legacyName,
  swPc, swSnapAlive, swSnapGen,
  unregPc, unregName, unregPid,
  lookupPc, lookupSnapLegacy,
  phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite
>>

Init ==
  /\ osAlive = [p \in Pids |-> FALSE]
  /\ osGen = [p \in Pids |-> NULL]
  /\ dbPresent = [p \in Pids |-> FALSE]
  /\ dbGen = [p \in Pids |-> NULL]
  /\ dbName = [p \in Pids |-> NULL]
  /\ dbGone = [p \in Pids |-> FALSE]
  /\ enrichedPids = {}
  /\ sweptPids = {}
  /\ legacyName = [p \in Pids |-> NULL]
  /\ swPc = "idle"
  /\ swSnapAlive = [p \in Pids |-> FALSE]
  /\ swSnapGen = [p \in Pids |-> NULL]
  /\ unregPc = "idle"
  /\ unregName = NULL
  /\ unregPid = NULL
  /\ lookupPc = "idle"
  /\ lookupSnapLegacy = [p \in Pids |-> NULL]
  /\ phantomDisappeared = FALSE
  /\ resurrectedUnregName = FALSE
  /\ staleEnrichedOverwrite = FALSE

-----------------------------------------------------------------------------
(* Action 1: agent.start (rpc/agent/start.rs:72-193)
   Spawns OS proc p with name n, registers in daemon.db, dual-writes to legacy
   agents.db, then runs apply_sweep() synchronously (line 190)!
   Modeled as two phases: (1a) spawn + register_start + dual_write_legacy,
   (1b) immediate post-start apply_sweep (server.rs:240-316).
   To keep state space tight, we combine start + its immediate post-start sweep.
*)
AgentStartWithPostSweep(p, n, g) ==
  /\ unregPc = "idle"  \* serialized by start_mutex
  /\ ~osAlive[p]
  /\ g \in Gens /\ g # osGen[p]
  \* Name uniqueness check: no live pid holds n
  /\ \A q \in Pids : dbName[q] = n => ~osAlive[q]
  /\ \A q \in Pids : legacyName[q] = n => ~osAlive[q]
  \* 1. Spawn OS process p
  /\ osAlive' = [osAlive EXCEPT ![p] = TRUE]
  /\ osGen' = [osGen EXCEPT ![p] = g]
  \* 2. register_start (daemon.db) + immediate apply_sweep() sees all currently alive procs!
  /\ dbPresent' = [q \in Pids |->
       IF q = p THEN TRUE
       ELSE IF osAlive[q] THEN TRUE
       ELSE IF dbPresent[q] /\ dbName[q] # NULL /\ dbName[q] # n THEN TRUE \* tombstone kept
       ELSE FALSE]
  /\ dbGen' = [q \in Pids |->
       IF q = p THEN g
       ELSE IF osAlive[q] THEN osGen[q]
       ELSE IF dbPresent[q] /\ dbName[q] # NULL /\ dbName[q] # n THEN dbGen[q]
       ELSE NULL]
  /\ dbName' = [q \in Pids |->
       IF q = p THEN n
       ELSE IF dbPresent[q] /\ dbName[q] = n THEN NULL \* reclaimed dead holder
       ELSE IF osAlive[q] /\ dbPresent[q] /\ dbGen[q] # NULL /\ dbGen[q] # osGen[q] THEN NULL \* pid reuse
       ELSE dbName[q]]
  /\ dbGone' = [q \in Pids |->
       IF q = p THEN FALSE
       ELSE IF osAlive[q] THEN FALSE
       ELSE IF dbPresent[q] /\ dbName[q] # NULL /\ dbName[q] # n THEN TRUE
       ELSE FALSE]
  \* 3. dual_write_legacy (agents.db)
  /\ legacyName' = [q \in Pids |->
       IF q = p THEN n
       ELSE IF legacyName[q] = n THEN NULL
       ELSE legacyName[q]]
  \* 4. post-start apply_sweep updates enriched & sweptPids
  /\ enrichedPids' = { q \in Pids : q = p \/ osAlive[q] }
  /\ sweptPids' = { q \in Pids : q = p \/ osAlive[q] }
  /\ UNCHANGED <<swPc, swSnapAlive, swSnapGen,
                 unregPc, unregName, unregPid,
                 lookupPc, lookupSnapLegacy,
                 phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite>>

-----------------------------------------------------------------------------
(* Action 2: Background 2s Timer Sweep (server.rs:240-316) — NO sweep_mutex!
   Step 2a: discover::sweep() captures ps snapshot (line 244)
   Step 2b: replaces self.enriched (line 290) and calls store.apply_agent_snapshot (line 291)
*)
TimerSweepCapture ==
  /\ swPc = "idle"
  /\ swPc' = "snapshotted"
  /\ swSnapAlive' = osAlive
  /\ swSnapGen' = osGen
  /\ UNCHANGED <<osAlive, osGen, dbPresent, dbGen, dbName, dbGone,
                 enrichedPids, sweptPids, legacyName,
                 unregPc, unregName, unregPid,
                 lookupPc, lookupSnapLegacy,
                 phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite>>

TimerSweepApply ==
  /\ swPc = "snapshotted"
  /\ LET curPids == { q \in Pids : swSnapAlive[q] }
         \* Live pids present in enrichedPids now (from newer sweep) that this stale sweep will erase!
         erasedLive == { q \in Pids : q \in enrichedPids /\ osAlive[q] /\ ~swSnapAlive[q] }
         \* Registered live pids that this stale sweep will TOMBSTONE & emit agent.disappeared for!
         tombstonedLive == { q \in Pids : dbPresent[q] /\ dbName[q] # NULL /\ ~dbGone[q] /\ osAlive[q] /\ ~swSnapAlive[q] }
     IN
       /\ staleEnrichedOverwrite' = (staleEnrichedOverwrite \/ erasedLive # {})
       /\ phantomDisappeared' = (phantomDisappeared \/ tombstonedLive # {})
       /\ enrichedPids' = curPids
       /\ sweptPids' = curPids
       \* Mirror Store::apply_agent_snapshot (store.rs:155-255)
       /\ dbPresent' = [q \in Pids |->
            IF swSnapAlive[q] THEN TRUE
            ELSE IF dbPresent[q] /\ dbName[q] # NULL THEN TRUE \* registered -> tombstone
            ELSE FALSE]
       /\ dbGen' = [q \in Pids |->
            IF swSnapAlive[q] THEN swSnapGen[q]
            ELSE IF dbPresent[q] /\ dbName[q] # NULL THEN dbGen[q]
            ELSE NULL]
       /\ dbName' = [q \in Pids |->
            IF swSnapAlive[q] THEN
              IF dbPresent[q] /\ dbGen[q] # NULL /\ dbGen[q] # swSnapGen[q] THEN NULL \* pid reuse drops reg
              ELSE dbName[q]
            ELSE IF dbPresent[q] /\ dbName[q] # NULL THEN dbName[q]
            ELSE NULL]
       /\ dbGone' = [q \in Pids |->
            IF swSnapAlive[q] THEN FALSE
            ELSE IF dbPresent[q] /\ dbName[q] # NULL THEN TRUE
            ELSE FALSE]
  /\ swPc' = "idle"
  /\ UNCHANGED <<osAlive, osGen, legacyName, swSnapAlive, swSnapGen,
                 unregPc, unregName, unregPid,
                 lookupPc, lookupSnapLegacy, resurrectedUnregName>>

-----------------------------------------------------------------------------
(* Action 3: agent.unregister RPC (rpc/agent/unregister.rs:13-27)
   Holds start_mutex, but splits:
     Step 3a: store.unregister(reg.pid)     (deletes from daemon.db)
     Step 3b: store.unregister_legacy(name) (deletes from agents.db)
   NOTE: agent.lookup does NOT hold start_mutex!
*)
UnregStep1_DaemonDb(p) ==
  /\ unregPc = "idle"
  /\ dbPresent[p] /\ dbName[p] # NULL
  /\ unregPc' = "unreg_daemon_done"
  /\ unregPid' = p
  /\ unregName' = dbName[p]
  /\ dbPresent' = [dbPresent EXCEPT ![p] = FALSE]
  /\ dbGen' = [dbGen EXCEPT ![p] = NULL]
  /\ dbName' = [dbName EXCEPT ![p] = NULL]
  /\ dbGone' = [dbGone EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<osAlive, osGen, enrichedPids, sweptPids, legacyName,
                 swPc, swSnapAlive, swSnapGen,
                 lookupPc, lookupSnapLegacy,
                 phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite>>

UnregStep2_LegacyDb ==
  /\ unregPc = "unreg_daemon_done"
  /\ legacyName' = [q \in Pids |-> IF legacyName[q] = unregName THEN NULL ELSE legacyName[q]]
  /\ unregPc' = "idle"
  /\ unregPid' = NULL
  /\ unregName' = NULL
  /\ UNCHANGED <<osAlive, osGen, dbPresent, dbGen, dbName, dbGone,
                 enrichedPids, sweptPids,
                 swPc, swSnapAlive, swSnapGen,
                 lookupPc, lookupSnapLegacy,
                 phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite>>

-----------------------------------------------------------------------------
(* Action 4: agent.lookup RPC (rpc/agent/lookup.rs:38-54) — NO start_mutex!
   Calls store.import_legacy_agents() (registry.rs:196-230):
     Step 4a: read_legacy_rows() reads agents.db WITHOUT holding daemon.db lock (line 197)
     Step 4b: acquires daemon.db lock and merges rows (lines 199-228)
*)
LookupStep1_ReadLegacy ==
  /\ lookupPc = "idle"
  /\ lookupPc' = "read_legacy"
  /\ lookupSnapLegacy' = legacyName
  /\ UNCHANGED <<osAlive, osGen, dbPresent, dbGen, dbName, dbGone,
                 enrichedPids, sweptPids, legacyName,
                 swPc, swSnapAlive, swSnapGen,
                 unregPc, unregName, unregPid,
                 phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite>>

LookupStep2_ImportMerge ==
  /\ lookupPc = "read_legacy"
  \* For each pid q with lookupSnapLegacy[q] = n:
  \*   UPDATE agents SET name=n WHERE pid=q AND name IS NULL
  \*   if 0 rows: INSERT OR IGNORE INTO agents (pid=q, name=n, gone_at=now)
  \*   Note: UNIQUE index on agents(name) WHERE name IS NOT NULL prevents inserting n if another row has n.
  /\ LET imported(q) ==
           /\ lookupSnapLegacy[q] # NULL
           /\ ~(\E r \in Pids : dbPresent[r] /\ dbName[r] = lookupSnapLegacy[q])
           /\ (~dbPresent[q] \/ dbName[q] = NULL)
         \* Did we resurrect a name that is NO LONGER in legacyName (i.e. was unregistered!)?
         resurrected == \E q \in Pids : imported(q) /\ legacyName[q] # lookupSnapLegacy[q]
     IN
       /\ resurrectedUnregName' = (resurrectedUnregName \/ resurrected)
       /\ dbPresent' = [q \in Pids |-> IF imported(q) THEN TRUE ELSE dbPresent[q]]
       /\ dbName' = [q \in Pids |-> IF imported(q) THEN lookupSnapLegacy[q] ELSE dbName[q]]
       /\ dbGone' = [q \in Pids |->
            IF imported(q) THEN
              IF dbPresent[q] THEN dbGone[q] ELSE TRUE \* attach keeps live, insert is tombstone
            ELSE dbGone[q]]
  /\ lookupPc' = "idle"
  /\ UNCHANGED <<osAlive, osGen, dbGen, enrichedPids, sweptPids, legacyName,
                 swPc, swSnapAlive, swSnapGen,
                 unregPc, unregName, unregPid, lookupSnapLegacy,
                 phantomDisappeared, staleEnrichedOverwrite>>

-----------------------------------------------------------------------------
(* Action 5: OS Process Exit *)
OSProcessExit(p) ==
  /\ osAlive[p]
  /\ osAlive' = [osAlive EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<osGen, dbPresent, dbGen, dbName, dbGone,
                 enrichedPids, sweptPids, legacyName,
                 swPc, swSnapAlive, swSnapGen,
                 unregPc, unregName, unregPid,
                 lookupPc, lookupSnapLegacy,
                 phantomDisappeared, resurrectedUnregName, staleEnrichedOverwrite>>

Next ==
  \/ \E p \in Pids, n \in Names, g \in Gens : AgentStartWithPostSweep(p, n, g)
  \/ TimerSweepCapture
  \/ TimerSweepApply
  \/ \E p \in Pids : UnregStep1_DaemonDb(p)
  \/ UnregStep2_LegacyDb
  \/ LookupStep1_ReadLegacy
  \/ LookupStep2_ImportMerge
  \/ \E p \in Pids : OSProcessExit(p)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Invariants *)

\* Structural: daemon.db UNIQUE index on name (where non-NULL) always holds
Inv_UniqueDbNames ==
  \A p, q \in Pids : (dbPresent[p] /\ dbPresent[q] /\ dbName[p] # NULL /\ dbName[p] = dbName[q]) => p = q

\* Bug check 1: A live newly-started agent must never receive phantom agent.disappeared / tombstone
Inv_NoPhantomDisappeared == ~phantomDisappeared

\* Bug check 2: An older sweep must never overwrite enriched cache with stale empty/older set
Inv_NoStaleEnrichedOverwrite == ~staleEnrichedOverwrite

\* Bug check 3: An unregistered agent must never be resurrected into daemon.db by import_legacy_agents
Inv_NoResurrectedUnregName == ~resurrectedUnregName

=============================================================================
