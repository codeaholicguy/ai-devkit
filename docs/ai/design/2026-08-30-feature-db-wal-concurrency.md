---
phase: design
title: Concurrency-safe WAL setup design
description: Configure SQLite connections without repeated WAL transition contention
---

# Design

```mermaid
flowchart LR
    Open[Open connection with 5s timeout] --> Read[Read journal_mode]
    Read -->|not wal| Set[Set WAL]
    Read -->|wal| Rest[Apply remaining pragmas]
    Set --> Rest
    Rest --> Done[Connection ready]
```

Each package keeps its local connection class and existing pragma order after WAL. Configuration errors propagate immediately.

Reading `journal_mode` does not initiate a transition. Already-WAL and readonly already-WAL connections therefore skip the write-oriented mode-set. Constructor `timeout: 5000` arms SQLite's handler before configuration begins.

The 5000 ms constructor timeout and conditional mode transition address normal concurrent opens. A rare simultaneous-fresh-database collision remains a visible, self-healing error rather than adding synchronous retry machinery.
