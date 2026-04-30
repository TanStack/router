---
'@tanstack/start-plugin-core': patch
---

Sort server function manifest entries by ID before emitting the resolver module. The `serverFnsById` map is populated in source-file scan order, which varies across machines and incremental builds, producing non-deterministic key ordering in the emitted `__tanstack-start-server-fn-resolver-*.mjs` artifact. Stable alphabetic sorting ensures reproducible builds, consistent content hashes, and clean `git diff` on committed artifacts.
