---
name: performance-review
description: Use for TanStack Router/Start repository performance investigations and changes to resource lifetimes, hydration/RSC, HMR, compiler/editor cost, dependencies, or chunk caching. Covers measurement and regression checks; use bundle-size-optimization for emitted-byte optimization.
---

# Performance review

Investigate a specific Router/Start mechanism with a comparable baseline and observable behavior. Follow the repository's build/test constraints in [AGENTS.md](../../AGENTS.md). Documentation-only changes that do not affect these mechanisms need their documentation checks, not this investigation.

## Select checks

Read [comparable measurements](../../.github/agent-guides/performance.md#comparable-measurements) for every measurement, then the applicable sections below. Combine sections when a change crosses boundaries.

| Mechanism                                                      | Reference                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime work, cleanup, hydration, RSC, or devtools             | [Runtime and lifecycle checks](../../.github/agent-guides/performance.md#runtime-and-lifecycle-checks); for live requests/rendering, also [browser and server measurements](../../.github/agent-guides/performance.md#browser-and-server-measurements) |
| Compiler work, maps, diagnostics, metadata, or module identity | [Build-tool checks](../../.github/agent-guides/performance.md#build-tool-checks)                                                                                                                                                                       |
| Hot updates, route deletion, or watcher replacement            | [HMR and watch lifetimes](../../.github/agent-guides/performance.md#hmr-and-watch-lifetimes) and the affected runtime/build checks                                                                                                                     |
| Dependency versions or bundler compatibility                   | [Dependency upgrades](../../.github/agent-guides/performance.md#dependency-upgrades) and the affected adapter checks                                                                                                                                   |
| Vendor/runtime chunks or deployment recovery                   | [Chunk caching and deployment recovery](../../.github/agent-guides/performance.md#chunk-caching-and-deployment-recovery)                                                                                                                               |
| TypeScript inference or compiler cost                          | [TypeScript cost](../../.github/agent-guides/performance.md#typescript-cost)                                                                                                                                                                           |

## Investigate and verify

1. Choose a representative workload and metric for the affected code. Reuse repository fixtures and installed tools. Attribute cost to code, configuration, a dependency, the toolchain, or the harness before choosing a fix; avoid speculative caches, indexes, concurrency, or dependency changes.
2. Exercise the affected packages and adapters through their real consumers. Source inspection or one adapter's passing tests cannot establish behavior in another adapter.
3. Establish a supported trigger and baseline before editing. Diagnostic counters must not create the work they claim to observe. Change one variable per control, check equivalent behavior, then run the same protocol on the final implementation. Use profiles or operation counts to explain timing, not a source-level suspicion as proof of a slowdown.
4. Verify each material finding against its owning source and actual check. Promote reproduced failures into existing behavioral tests or stable operation/artifact bounds; avoid noisy elapsed-time assertions. Assert the effect that exposed the bug: execution count, requests, retained resources, or intermediate failure, as well as final output. Preserve request isolation, side-effect ordering, required waits, and intentional cache/replay lifetimes.
5. Rerun the regression and relevant performance checks on the final implementation. Experimental controls can isolate a cause but do not replace tests of the actual fix.

When changes interact, test both their individual and combined behavior where applicable. Recheck the combined implementation after repairs; a clean textual merge does not establish behavioral compatibility.

For emitted client JavaScript, continue through the [bundle-size-optimization skill](../bundle-size-optimization/SKILL.md). Use the same implementation for behavior checks and bundle measurements.
