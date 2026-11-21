---
phase: design
title: Design — nested agent start HOME divergence (#402)
---

# Design — #402

Identity stores (registry SQLite, devkitd socket) resolve from `$HOME`. Sandboxed callers may overlay `$HOME` while the daemon and normal CLIs use the passwd account home.

## Approach

1. Prefer daemon `agent.start` (already on main) so registration happens in the daemon store.
2. Local fallback: compare `$HOME` to `os.userInfo().homedir`; refuse before tmux when the account `.ai-devkit` store exists; warn when self-consistent sandbox only.
3. Round-trip `registry.lookup(name)` after `register()`; fail if missing or PID mismatch.
4. Block daemon autostart under divergent HOME.
5. Prefix discovery-only synthesized names with `unregistered:` in `listAgents`.