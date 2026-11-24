---
phase: implementation
title: Agent group daemon implementation notes
description: Implementation summary, review fixes, and design alignment for issue 413
---

# Implementation notes

## Summary of Changes

### Rust (`devkit-core` & `devkitd`)
- `rust/crates/devkit-core/src/store/groups.rs`:
  - `init_groups` enables `PRAGMA foreign_keys = ON` and creates `groups`
    (with `ordinal` for insertion-order listing) and `group_members` (with
    `ON DELETE CASCADE` and `(group_name, position)` ordering).
  - Transactional CRUD (`create_group`, `update_group`, `add_group_member`,
    `remove_group_member`, `remove_group`, `get_group`, `list_groups`) with
    `AGENT_NAME_REGEX`-equivalent validation, member trimming/deduplication,
    no-op add preserving `updatedAt`, and single-query `LEFT JOIN` listing.
  - Typed `GroupError` with structured codes (`not_found`, `conflict`,
    `invalid_name`, `invalid_member`, `empty_members`, `storage`) and details.
- `rust/crates/devkit-core/src/proto.rs`:
  - Added `GroupNameParams`, `GroupMembersParams`, `GroupMemberParams` and
    exported `ts-rs` bindings for `AgentGroup` and all three param types.
- `rust/crates/devkitd/src/rpc/group.rs` & `rust/crates/devkitd/src/server.rs`:
  - Dispatched `group.*` RPCs (`group.create`, `group.update`, `group.add`,
    `group.remove_agent`, `group.remove`, `group.list`, `group.detail`,
    `group.lookup`) in a single explicit `match` with `unknown_method` fallback.

### TypeScript (`daemon-client` & `cli`)
- `packages/daemon-client/src/client.ts`, `index.ts`, `gen/*.ts`:
  - Generated bindings and added 8 typed `DaemonClient` group methods
    (`createGroup`, `updateGroup`, `addGroupMember`, `removeGroupMember`,
    `removeGroup`, `listGroups`, `getGroup`, `lookupGroup`).
- `packages/cli/src/services/agent/agent-group.service.ts`:
  - Replaced JSON persistence with daemon-backed `AgentGroupService` calling
    the typed `DaemonClient` methods.
  - Supports caller-owned `client` reuse and `onDebug` logging; maps coded RPC
    errors back to the 6 `AgentGroup*Error` classes via `mapGroupRpcError`.
- `packages/cli/src/util/agent.ts`:
  - Houses the shared `createDaemonEntryRegistry` helper for client-side runtime
    delivery without service-to-command coupling.
- `packages/cli/src/commands/agent/group.command.ts`:
  - All 7 subcommands await `AgentGroupService` and support `--debug` logging.
- `packages/cli/src/commands/agent/send.command.ts` & `services/agent/agent.service.ts`:
  - `send --group` opens one daemon connection, calls `group.lookup`, then
    resolves each member via `agent.lookup` and delivers client-side through
    `sendAgentPrompt`.
  - Only `DaemonRpcError` `not_found` and `!entry.alive` are recorded as
    per-member resolution errors; transport failures and `unknown method` abort
    and rethrow immediately.
  - Removed dead `warnIfAgentIsBusy` helper since `agent.lookup` does not report
    turn status.
- `packages/cli/src/commands/agent/wait.command.ts`:
  - Awaits `AgentGroupService.get()` with `onDebug` forwarding.

## Post-Review & Simplification Updates (2026-11-24)

1. Rebased onto `origin/main` (`7528c760`, including PR #456 durable agents)
   and resolved 5 integration conflicts.
2. Fixed `sendToAgentGroup` false `status: unknown` busy warnings and stopped
   swallowing daemon transport / `unknown method` errors as missing members.
3. Wired `AgentGroupService` to the typed `DaemonClient` methods and reused a
   single daemon connection in `send --group`.
4. Simplified `store/groups.rs` (`add_group_member` / `remove_group_member`
   split, single `LEFT JOIN` in `list_groups`, clearer naming), `rpc/group.rs`,
   `agent-group.service.ts` (`mapGroupRpcError`), and removed dead test mocks.
5. Added `--debug` option to all 7 `agent group` subcommands and wired `onDebug`
   through `AgentGroupService`, `send --group`, and `wait --group`.
6. Removed the legacy `agent-groups.json` migration path (`import_groups`,
   `group_migrations`, `groups_ready`, `groups_source`) per user decision since
   no users rely on the legacy file yet.
