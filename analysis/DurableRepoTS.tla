--------------------------- MODULE DurableRepoTS ---------------------------
(*
  Formal TLA+ model of packages/agent-manager/src/durable/DurableAgentRepository.ts
  modeling concurrent CLI callers running acquireRun / recordProviderProcess /
  completeRun / reconcile against shared SQLite (agents.db).

  Specifically captures:
    - acquireRun (lines 148-212):
        1. findById (snapshot)
        2. isActive(snapshot.activeRun) (outside transaction!)
        3. BEGIN IMMEDIATE: checks current.activeRun.token == observed.token
           and WHERE active_run_token = ? AND active_owner_started_at = ?
           AND active_run_started_at = ?  (DOES NOT check active_provider_pid!)
    - recordProviderProcess (lines 214-224)
    - reconcile (lines 317-343):
        1. listRaw() (snapshot)
        2. isActive(snapshot.activeRun) (outside transaction!)
        3. UPDATE ... WHERE id=? AND state='running' AND active_run_token=?
           AND active_owner_started_at=? AND active_run_started_at=?
*)
EXTENDS Naturals, FiniteSets

CONSTANTS Callers \* e.g. {"c1", "c2"}

NULL == "NULL"

VARIABLES
  \* --- SQLite durable_agents row ---
  dbState,          \* "ready" | "running" | "degraded"
  dbToken,          \* NULL | "t_c1" | "t_c2"
  dbOwner,          \* NULL \cup Callers
  dbProvider,       \* NULL \cup Callers (provider spawned by that caller)

  \* --- OS process liveness ---
  ownerAlive,       \* [Callers -> BOOLEAN]
  providerAlive,    \* [Callers -> BOOLEAN]

  \* --- Per-caller PC & local snapshot ---
  \* "idle" | "acq_snap" | "acq_checked" | "has_token" | "recorded" | "rec_snap" | "rec_checked" | "done"
  pc,
  snapToken,        \* [Callers -> {NULL} \cup Callers]
  snapOwner,        \* [Callers -> {NULL} \cup Callers]
  snapProvider,     \* [Callers -> {NULL} \cup Callers]
  myToken           \* [Callers -> {NULL} \cup Callers]

vars == <<
  dbState, dbToken, dbOwner, dbProvider,
  ownerAlive, providerAlive,
  pc, snapToken, snapOwner, snapProvider, myToken
>>

\* Mirrors DurableAgentRepository.ts:463-468
IsActive(owner, provider) ==
  \/ (owner # NULL /\ ownerAlive[owner])
  \/ (provider # NULL /\ providerAlive[provider])

Init ==
  /\ dbState = "ready"
  /\ dbToken = NULL
  /\ dbOwner = NULL
  /\ dbProvider = NULL
  /\ ownerAlive = [c \in Callers |-> TRUE]
  /\ providerAlive = [c \in Callers |-> FALSE]
  /\ pc = [c \in Callers |-> "idle"]
  /\ snapToken = [c \in Callers |-> NULL]
  /\ snapOwner = [c \in Callers |-> NULL]
  /\ snapProvider = [c \in Callers |-> NULL]
  /\ myToken = [c \in Callers |-> NULL]

\* --- acquireRun Step 1: line 150 findById ---
AcqSnapshot(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "idle"
  /\ snapToken' = [snapToken EXCEPT ![c] = dbToken]
  /\ snapOwner' = [snapOwner EXCEPT ![c] = dbOwner]
  /\ snapProvider' = [snapProvider EXCEPT ![c] = dbProvider]
  /\ pc' = [pc EXCEPT ![c] = "acq_snap"]
  /\ UNCHANGED <<dbState, dbToken, dbOwner, dbProvider, ownerAlive, providerAlive, myToken>>

\* --- acquireRun Step 2: line 154-155 isActive(observed) ---
AcqCheckActive(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "acq_snap"
  /\ IF snapToken[c] # NULL /\ IsActive(snapOwner[c], snapProvider[c]) THEN
       \* Throws DurableAgentBusyError
       /\ pc' = [pc EXCEPT ![c] = "done"]
     ELSE
       /\ pc' = [pc EXCEPT ![c] = "acq_checked"]
  /\ UNCHANGED <<dbState, dbToken, dbOwner, dbProvider, ownerAlive, providerAlive,
                 snapToken, snapOwner, snapProvider, myToken>>

\* --- acquireRun Step 3: lines 163-199 BEGIN IMMEDIATE ---
\* Note: SQLite WHERE clause checks state <> 'running' OR
\*       (active_run_token = observed.token AND active_owner_started_at = observed.owner ...)
\*       It does NOT check active_provider_pid or re-evaluate isActive(current)!
AcqCommit(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "acq_checked"
  /\ IF dbState # "running" \/ (dbToken = snapToken[c] /\ dbOwner = snapOwner[c] /\ snapToken[c] # NULL) THEN
       /\ dbState' = "running"
       /\ dbToken' = c
       /\ dbOwner' = c
       /\ dbProvider' = NULL
       /\ myToken' = [myToken EXCEPT ![c] = c]
       /\ pc' = [pc EXCEPT ![c] = "has_token"]
     ELSE
       \* Throws DurableAgentBusyError
       /\ pc' = [pc EXCEPT ![c] = "done"]
       /\ UNCHANGED <<dbState, dbToken, dbOwner, dbProvider, myToken>>
  /\ UNCHANGED <<ownerAlive, providerAlive, snapToken, snapOwner, snapProvider>>

\* --- Spawn provider + recordProviderProcess (lines 214-224) ---
SpawnAndRecordProvider(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "has_token"
  /\ dbState = "running"
  /\ dbToken = myToken[c]
  /\ providerAlive' = [providerAlive EXCEPT ![c] = TRUE]
  /\ dbProvider' = c
  /\ pc' = [pc EXCEPT ![c] = "recorded"]
  /\ UNCHANGED <<dbState, dbToken, dbOwner, ownerAlive, snapToken, snapOwner, snapProvider, myToken>>

\* --- Owner CLI crashes (e.g. SIGKILL / OOM / terminal closed) while provider still running ---
OwnerCrash(c) ==
  /\ ownerAlive[c]
  /\ pc[c] \in {"has_token", "recorded"}
  /\ ownerAlive' = [ownerAlive EXCEPT ![c] = FALSE]
  /\ pc' = [pc EXCEPT ![c] = "done"]
  /\ UNCHANGED <<dbState, dbToken, dbOwner, dbProvider, providerAlive,
                 snapToken, snapOwner, snapProvider, myToken>>

\* --- reconcile() Step 1: line 319 listRaw() ---
RecSnapshot(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "idle"
  /\ dbState = "running"
  /\ dbToken # NULL
  /\ snapToken' = [snapToken EXCEPT ![c] = dbToken]
  /\ snapOwner' = [snapOwner EXCEPT ![c] = dbOwner]
  /\ snapProvider' = [snapProvider EXCEPT ![c] = dbProvider]
  /\ pc' = [pc EXCEPT ![c] = "rec_snap"]
  /\ UNCHANGED <<dbState, dbToken, dbOwner, dbProvider, ownerAlive, providerAlive, myToken>>

\* --- reconcile() Step 2: line 321 isActive(snapshot.activeRun!) ---
RecCheckActive(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "rec_snap"
  /\ IF IsActive(snapOwner[c], snapProvider[c]) THEN
       /\ pc' = [pc EXCEPT ![c] = "done"]
     ELSE
       /\ pc' = [pc EXCEPT ![c] = "rec_checked"]
  /\ UNCHANGED <<dbState, dbToken, dbOwner, dbProvider, ownerAlive, providerAlive,
                 snapToken, snapOwner, snapProvider, myToken>>

\* --- reconcile() Step 3: lines 323-341 UPDATE ---
RecCommit(c) ==
  /\ ownerAlive[c]
  /\ pc[c] = "rec_checked"
  /\ IF dbState = "running" /\ dbToken = snapToken[c] /\ dbOwner = snapOwner[c] THEN
       /\ dbState' = "degraded"
       /\ dbToken' = NULL
       /\ dbOwner' = NULL
       /\ dbProvider' = NULL
     ELSE
       UNCHANGED <<dbState, dbToken, dbOwner, dbProvider>>
  /\ pc' = [pc EXCEPT ![c] = "done"]
  /\ UNCHANGED <<ownerAlive, providerAlive, snapToken, snapOwner, snapProvider, myToken>>

Next ==
  \E c \in Callers :
    \/ AcqSnapshot(c)
    \/ AcqCheckActive(c)
    \/ AcqCommit(c)
    \/ SpawnAndRecordProvider(c)
    \/ OwnerCrash(c)
    \/ RecSnapshot(c)
    \/ RecCheckActive(c)
    \/ RecCommit(c)

Spec == Init /\ [][Next]_vars

\* INVARIANT 1: At most one provider process is alive at any time for this durable agent
Inv_AtMostOneLiveProvider ==
  Cardinality({ c \in Callers : providerAlive[c] }) <= 1

\* INVARIANT 2: If a provider is alive, DB must still mark its run as active/running
Inv_LiveProviderNotClobbered ==
  \A c \in Callers : providerAlive[c] => (dbState = "running" /\ dbToken = c)

=============================================================================
