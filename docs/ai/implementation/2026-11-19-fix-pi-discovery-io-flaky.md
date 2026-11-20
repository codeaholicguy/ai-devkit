# Fix PiDiscoveryIO flaky test

## Root cause

`PiSessionLocator` skipped re-scanning no-match project dirs when directory `mtimeMs` was unchanged. On Linux, directory mtimes are often second-granular; adding a session file in the same second as the prior scan left the cache stale.

## Fix

Track `jsonlCount` in the no-match cache. When directory mtime matches the cached value but still lies in the current wall-clock second, compare file count via `readdir` before skipping (mtime alone cannot catch a same-second add).

## Loop evidence

| Load | Before fix | After fix |
|---|---|---|
| `npm run test` (50×) | 12/50 PiDiscoveryIO failures | 0/50 failures |
| PiDiscoveryIO alone (100×) | 100/100 pass (flake only under parallel suite) | 100/100 pass |