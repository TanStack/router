# Router utils

- `src/compiler/` is the compiler core shared by `router-plugin` and `start-plugin-core`. Read its
  [README](src/compiler/README.md) before changing it. Keep its invariants: no Yuku object reachable from a cache or from
  plan facts, plan reuse only after validation, edges per output, every cache bounded and invalidated through `invalidate()`.
- Core changes need core unit tests in `tests/` (toy planners and the memory host in `tests/helpers.ts`); behaviour is
  covered by the oracle suites of the consuming packages ([compiler-test-utils/AGENTS.md](../compiler-test-utils/AGENTS.md)).
- `yuku` is pinned to an exact version. Report Yuku bugs upstream instead of working around them here.
