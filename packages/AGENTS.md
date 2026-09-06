# Packages

- Route generation/code splitting live in `router-generator`/`router-plugin`; Start build transforms live in `start-plugin-core`.

## Router bindings

- Navigation/render identity is more than href or route membership: same-href navigations can have different history keys, and suspended renders must acknowledge only their own match publication. Preserve those identity checks when optimizing stores or render notifications.
- In navigation params/search, an explicit `undefined` can clear an inherited value; an absent key can inherit it. Preserve that distinction when comparing or memoizing options; React's `useValueStable` uses `deepEqual` with `ignoreUndefined: false`.

## Lifecycle and runtime cost

- For optional features, measure disabled/idle work as well as enabled work. Gate unnecessary allocation, subscriptions, scans, and decoding before setup where safe; a handler that immediately returns still has registration cost. Preserve user handlers and off/on/off transitions.
- For listeners, subscriptions, observers, timers, caches, and patched globals, name the owner and cleanup path. Test overlapping instances, both disposal orders, replacement, and events after disposal. Verify which owner receives subsequent work, not just whether cleanup ran. Apply this to scroll restoration across router lifetimes as well as framework unmounts.
- For hydration changes, cover initial SSR hydration, CSR, later-mounted boundaries, unrelated ancestor updates, intentional option changes, and disposal. Define which event starts or resets a deadline; test inline/equivalent strategy values and browsers with and without the relevant scheduling API. Preserve intentional pending-UI waits and loader/context ordering.
- For head, Scripts, Asset, or injected-code changes, assert execution counts through attribute/content combinations, hydration, navigation, and removal. Final markup can hide duplicate side effects; distinguish elements, fetch attempts, transferred bytes, and executions.
- For repeated scans or recursive transforms, exercise increasing input sizes and supported empty, deep, wide, shared-reference, and cyclic inputs. Count work separately from elapsed time; preserve ordering, identity, and serialization behavior before retaining a faster implementation.
- For devtools core or wrapper changes, read the [devtools guide](router-devtools-core/AGENTS.md), including router-prop replacement and closed-panel work.

## Tests

- Inspect test commands: several `test:unit` scripts immediately exit or only echo a message. For these packages, validate behavior in the shared core or consuming e2e app; a successful placeholder target provides no unit coverage.
- For `*-router-ssr-query` changes, run `router-ssr-query-core` unit tests and the affected framework's `e2e/<framework>-start/query-integration` tests. The framework wrapper unit targets currently exit without running tests.
- For single-command Vitest targets, append filters after `--`, e.g. `-- tests/link.test.tsx -t "preloading"`.
- `solid-router` and `router-generator` chain two Vitest commands in `test:unit`. Trailing file/name/update arguments reach only the final command. Run the full target for verification: Solid needs browser and server suites; the generator needs fixture generation followed by typechecking.
- For public type changes, add `*.test-d.*` inference regressions and run both unit and type targets. React/Solid Router's TypeScript compiler matrix checks `src`; Vitest runs their inference tests. For changes to inference cost, follow the [type-safety performance guidance](../docs/router/guide/type-safety.md#performance-recommendations); `test:perf` measures runtime, not compiler cost.
- For measured inference changes, also follow the [TypeScript cost procedure](../.github/agent-guides/performance.md#typescript-cost); a passing typecheck is not evidence of unchanged compiler or editor performance.
