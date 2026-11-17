# Router utils

- `src/compiler/` is the compiler core shared by `router-plugin` and `start-plugin-core`. Read its
  [README](src/compiler/README.md) before changing it. Keep its invariants: no Yuku object reachable from a cache or from
  plan facts, plan reuse only after validation, edges per output, every cache bounded and invalidated through `invalidate()`.
- Core changes are tested by behaviour, through the public plugins in the oracle suites of the consuming packages
  (router-plugin, router-generator, start-plugin-core: [compiler-test-utils/AGENTS.md](../compiler-test-utils/AGENTS.md)):
  a change a user can see needs a test there. `tests/` holds only what no public input reaches: the safety nets
  (`verify`, `server-code`, `self-checks`, the cut check in `rewrite`), pure functions whose contract is external
  (`strings`, `output-builder`, `identity`), a filesystem assumption (`file-times`), and rows kept as the sole
  coverage of a path the oracle does not reach yet, each file saying which (toy planners and the memory host in
  `tests/helpers.ts`). Add no other core unit test.
- `yuku` is pinned to an exact version. Report Yuku bugs upstream instead of working around them here.
