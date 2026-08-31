---
phase: implementation
title: Session Reconciliation Implementation
description: Registry, manager, migration, and kill changes
---

# Session Reconciliation Implementation

- `005_interactive_agent_identity.sql` adds the `(type, session_id)` lookup index.
- The agent-manager build cleans `dist` before copying migrations so a renamed
  migration cannot leave two files with the same schema version in packaged output.
- `AgentRegistry.reconcile` uses one immediate transaction for identity matching,
  unbound adoption, PID migration/displacement, insertion, and absent-row deletion.
- Matching sessions preserve name, tmux link, pin, start time, and other managed metadata.
- `AgentManager.listAgents` reconciles successful adapter types; thrown types are untouched.
- Pinning and refresh perform no PID-liveness probes.
- Kill hard-deletes rows. The command-level registry lookup remains necessary when
  an adapter throws: reconciliation skips that type, so its retained row may still
  be explicitly killed and its tmux session cleaned.

The incident evidence remains the sandbox PID-namespace prune followed by
default-name re-registration. The final product decision accepts equivalent
metadata loss after a blind successful observation; session identity protects
normal refreshes, PID migration, and the start-row-to-detected-session transition.
