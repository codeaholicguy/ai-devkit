-------------------------- MODULE DaemonAutostart --------------------------
(*
  Formal TLA+ model of devkitd autostart + stale-daemon replacement + Unix socket
  ownership handoff.

  Source code modeled:
    - packages/daemon-client/src/autostart.ts
        (ensureDaemon:19-84, replaceStaleDaemon:153-184,
         acquireSpawnLock:236-254, waitForSocket:256-271,
         waitForSocketDead:273-282, waitForLockRelease:284-296)
    - rust/crates/devkitd/src/main.rs (lines 35-38: Daemon::new -> apply_sweep -> serve)
    - rust/crates/devkitd/src/server.rs
        (shutdown:204-210: responds ok, sleeps 50ms, process::exit(0);
         serve:426-436: exists -> connect -> remove_file -> bind)
*)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Clients, \* e.g. {"c1", "c2"}
  Daemons  \* e.g. {"d1", "d2"}

NULL == "NULL"

VARIABLES
  \* --- Filesystem state ---
  lockHolder,     \* NULL \cup Clients (who created .spawn.lock)
  lockStale,      \* BOOLEAN (whether mtime > STALE_LOCK_MS, e.g., slow starter)
  sockExists,     \* BOOLEAN (whether daemon.sock inode exists at path)
  sockOwner,      \* NULL \cup Daemons (which daemon currently listens on daemon.sock inode)

  \* --- Daemon instances ---
  \* "unspawned" | "sweeping" | "serve_checked_dead" | "serving" | "shutting_down" | "dead"
  dState,         \* [Daemons -> ...]
  dVersion,       \* [Daemons -> {"old", "new"}]
  dHasListener,   \* [Daemons -> BOOLEAN] (daemon holds open listening socket, even if unlinked!)

  \* --- CLI clients ---
  \* "start" | "got_lock_spawn" | "waiting_sock" | "got_lock_replace" | "sent_shutdown" | "done"
  cPc,            \* [Clients -> ...]
  cVersion,       \* [Clients -> {"new"}]

  \* --- Ghost telemetry ---
  unlinkedLiveSocket, \* TRUE if serve() unlinked a socket belonging to a live daemon
  dualLiveDaemons     \* TRUE if 2 daemons are simultaneously alive (writing daemon.db)

vars == <<
  lockHolder, lockStale, sockExists, sockOwner,
  dState, dVersion, dHasListener,
  cPc, cVersion,
  unlinkedLiveSocket, dualLiveDaemons
>>

LiveDaemons == { d \in Daemons : dState[d] \in {"sweeping", "serve_checked_dead", "serving", "shutting_down"} }

\* Can UnixStream::connect(&socket_path) succeed right now?
SocketConnectable ==
  sockExists /\ sockOwner # NULL /\ dState[sockOwner] \in {"serving", "shutting_down"}

Init ==
  /\ lockHolder = NULL
  /\ lockStale = FALSE
  /\ sockExists \in BOOLEAN \* Either clean start or stale socket file left by prior crash
  /\ sockOwner = NULL
  /\ dState = [d \in Daemons |-> "unspawned"]
  /\ dVersion = [d \in Daemons |-> "new"]
  /\ dHasListener = [d \in Daemons |-> FALSE]
  /\ cPc = [c \in Clients |-> "start"]
  /\ cVersion = [c \in Clients |-> "new"]
  /\ unlinkedLiveSocket = FALSE
  /\ dualLiveDaemons = FALSE

-----------------------------------------------------------------------------
(* Client actions: ensureDaemon() (autostart.ts:19-84) *)

\* Client sees no live socket, acquires spawn lock (autostart.ts:67)
ClientAcquireLock(c) ==
  /\ cPc[c] = "start"
  /\ ~SocketConnectable
  /\ lockHolder = NULL
  /\ lockHolder' = c
  /\ lockStale' = FALSE
  /\ cPc' = [cPc EXCEPT ![c] = "got_lock_spawn"]
  /\ UNCHANGED <<sockExists, sockOwner, dState, dVersion, dHasListener,
                 cVersion, unlinkedLiveSocket, dualLiveDaemons>>

\* Client spawns a daemon (autostart.ts:79) and begins waiting for socket (waitMs=3000)
ClientSpawn(c, d) ==
  /\ cPc[c] = "got_lock_spawn"
  /\ dState[d] = "unspawned"
  /\ dState' = [dState EXCEPT ![d] = "sweeping"]
  /\ cPc' = [cPc EXCEPT ![c] = "waiting_sock"]
  /\ dualLiveDaemons' = (dualLiveDaemons \/ Cardinality(LiveDaemons \cup {d}) > 1)
  /\ UNCHANGED <<lockHolder, lockStale, sockExists, sockOwner, dVersion, dHasListener,
                 cVersion, unlinkedLiveSocket>>

\* Client waitForSocket times out (3s) while spawned daemon is STILL in initial apply_sweep()
\* (main.rs:37 runs apply_sweep() BEFORE serve() binds the socket!)
\* autostart.ts:80-83 finally { releaseSpawnLock(lockPath); }
ClientWaitTimeoutReleaseLock(c) ==
  /\ cPc[c] = "waiting_sock"
  /\ ~SocketConnectable
  /\ lockHolder = c
  /\ lockHolder' = NULL
  /\ lockStale' = FALSE
  /\ cPc' = [cPc EXCEPT ![c] = "done"]
  /\ UNCHANGED <<sockExists, sockOwner, dState, dVersion, dHasListener,
                 cVersion, unlinkedLiveSocket, dualLiveDaemons>>

\* Client sees socket ready and releases lock
ClientWaitSuccessReleaseLock(c) ==
  /\ cPc[c] = "waiting_sock"
  /\ SocketConnectable
  /\ lockHolder = c
  /\ lockHolder' = NULL
  /\ lockStale' = FALSE
  /\ cPc' = [cPc EXCEPT ![c] = "done"]
  /\ UNCHANGED <<sockExists, sockOwner, dState, dVersion, dHasListener,
                 cVersion, unlinkedLiveSocket, dualLiveDaemons>>

-----------------------------------------------------------------------------
(* Daemon startup: main.rs:36-38 -> server.rs:426-436 *)

\* Step 1 of serve(): socket_path exists and connect() fails -> plans to remove_file
DaemonServeCheckStaleSock(d) ==
  /\ dState[d] = "sweeping"
  /\ sockExists
  /\ ~SocketConnectable
  /\ dState' = [dState EXCEPT ![d] = "serve_checked_dead"]
  /\ UNCHANGED <<lockHolder, lockStale, sockExists, sockOwner, dVersion, dHasListener,
                 cPc, cVersion, unlinkedLiveSocket, dualLiveDaemons>>

\* Step 2 of serve() after check: remove_file(&socket_path) then bind(&socket_path)!
\* TOCTOU: if another daemon bound socket_path in between, remove_file UNLINKS THE LIVE SOCKET!
DaemonServeUnlinkAndBind(d) ==
  /\ dState[d] = "serve_checked_dead"
  /\ unlinkedLiveSocket' = (unlinkedLiveSocket \/ (sockExists /\ sockOwner # NULL /\ dState[sockOwner] = "serving"))
  /\ sockExists' = TRUE
  /\ sockOwner' = d
  /\ dState' = [dState EXCEPT ![d] = "serving"]
  /\ dHasListener' = [dHasListener EXCEPT ![d] = TRUE]
  /\ UNCHANGED <<lockHolder, lockStale, dVersion, cPc, cVersion, dualLiveDaemons>>

\* Direct bind when socket_path does not exist (server.rs:436)
DaemonServeBindFresh(d) ==
  /\ dState[d] = "sweeping"
  /\ ~sockExists
  /\ sockExists' = TRUE
  /\ sockOwner' = d
  /\ dState' = [dState EXCEPT ![d] = "serving"]
  /\ dHasListener' = [dHasListener EXCEPT ![d] = TRUE]
  /\ UNCHANGED <<lockHolder, lockStale, dVersion, cPc, cVersion, unlinkedLiveSocket, dualLiveDaemons>>

\* Daemon sees existing live socket on connect() and bails cleanly (server.rs:432)
DaemonServeBailLive(d) ==
  /\ dState[d] = "sweeping"
  /\ SocketConnectable
  /\ dState' = [dState EXCEPT ![d] = "dead"]
  /\ UNCHANGED <<lockHolder, lockStale, sockExists, sockOwner, dVersion, dHasListener,
                 cPc, cVersion, unlinkedLiveSocket, dualLiveDaemons>>

\* Existing daemon crashes leaving stale socket file behind (normal crash scenario)
DaemonCrashLeavingStaleSock(d) ==
  /\ dState[d] = "serving"
  /\ dState' = [dState EXCEPT ![d] = "dead"]
  /\ dHasListener' = [dHasListener EXCEPT ![d] = FALSE]
  /\ UNCHANGED <<lockHolder, lockStale, sockExists, sockOwner, dVersion,
                 cPc, cVersion, unlinkedLiveSocket, dualLiveDaemons>>

Next ==
  \/ \E c \in Clients : ClientAcquireLock(c)
  \/ \E c \in Clients, d \in Daemons : ClientSpawn(c, d)
  \/ \E c \in Clients : ClientWaitTimeoutReleaseLock(c)
  \/ \E c \in Clients : ClientWaitSuccessReleaseLock(c)
  \/ \E d \in Daemons : DaemonServeCheckStaleSock(d)
  \/ \E d \in Daemons : DaemonServeUnlinkAndBind(d)
  \/ \E d \in Daemons : DaemonServeBindFresh(d)
  \/ \E d \in Daemons : DaemonServeBailLive(d)
  \/ \E d \in Daemons : DaemonCrashLeavingStaleSock(d)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Invariants *)

Inv_AtMostOneLiveDaemon == ~dualLiveDaemons
Inv_NeverUnlinkLiveSocket == ~unlinkedLiveSocket

=============================================================================
