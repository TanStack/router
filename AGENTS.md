# AGENTS.md

## Scope

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before analyzing or changing this repository; its contribution and PR requirements apply.
- Read applicable nested `AGENTS.md` files before editing or testing a subtree.
- Shared routing belongs in `packages/router-core`; check React, Solid, and Vue bindings for shared changes. Shared Start runtime/build logic lives in `packages/start-*-core`.
- Keep scratch checkouts outside the workspace's project-discovery tree to avoid duplicate Nx projects. Use separate benchmark results and build-output directories for independent comparisons.

## Build and test constraints

- Regression coverage must establish a supported public trigger and observable failure. Tests that directly mutate internals do not establish that an application can reach the failing state.
- Diagnostic counters and profiles may observe that supported path without changing its behavior. A diagnostic control proves only the measured mechanism; verify the final implementation through public behavior or the supported compiler-plugin boundary.
- For asynchronous setup and cleanup, identify the authoritative state and lifetime before adding flags, timers, or completion callbacks. Preserve intentional ownership transfers and remove obsolete paths when replacing an implementation.
- Use Node from `.nvmrc` and pnpm from root `package.json`. Install at the root with `CI=1 pnpm install --frozen-lockfile`.
- Diagnose registry, store, and network failures separately from dependency incompatibilities. Preserve the lockfile and workspace trust/build policies when troubleshooting installation; bypassing scripts or policies changes the environment being tested.
- Never manually edit `pnpm-lock.yaml` or any `routeTree.gen.ts`. Regenerate the lockfile with `pnpm install --no-frozen-lockfile` after intentional dependency changes; regenerate route trees through app builds/dev servers or the generator fixture harness.
- Always use control-flow braces. Format changed files with the repository's Prettier configuration; root `pnpm format` writes across the checkout.
- Use Nx: workspace imports consume built packages, so direct runners can test stale dependencies. Inspect resolved targets; some are inferred.

```sh
CI=1 NX_DAEMON=false pnpm nx run <project>:<target> --outputStyle=stream --skipRemoteCache
```

- Avoid overlapping Nx invocations that write to the same build outputs. If project-graph startup stalls, inspect logs and running processes before using `pnpm nx reset`; quiet output from running tests or benchmarks is not evidence of a graph stall.
- For code changes, run affected packages' `test:unit`, `test:types`, and `test:eslint` where available, including affected consumers; use `test:e2e` for browser/app behavior and `test:build` for exports/build changes. Root `pnpm test` includes the full e2e suite. Published-code changes require `pnpm changeset`.

## Runtime rules

- Import `isServer` from `@tanstack/router-core/isServer`. Conditional exports select: `development` → `undefined`; server (`workerd`, `worker`, `deno`, `node`, `bun`) → `true` except `NODE_ENV=test` → `undefined`; browser/fallback → `false`. `development` wins; `NODE_ENV=development` alone does not select it.
- Keep `isServer ?? router.isServer` directly in each branch condition for dead-code elimination; negate the whole expression for client branches. Never extract it into a variable (e.g. `const serverRendering = isServer ?? router.isServer`) or helper. Without a router, inline `isServer ?? typeof window === 'undefined'` (or the existing `document` check). Keep the constant first and use `??`, never `||`.
- **Never create UI/router reactivity on the server, including development/tests.** Branch before reactive setup; use direct reads and core non-reactive stores. Required transport listeners are allowed only with request-scoped lifetimes and cleanup.
- Shared route definitions/build metadata must not acquire request/user data. Keep it on the request's Router, context, or QueryClient.
- HMR can replace code while caches and pending work survive. Invalidate derived state or bypass caching in development; reject stale async results while preserving intentional HMR identities/state.
- Gate developer diagnostics and message construction with direct `process.env.NODE_ENV !== 'production'` checks. Preserve required validation/throws in production (e.g. detailed development error, compact `invariant()` failure). `!== 'development'` also enables the guarded code in tests; preserve existing dev-server mode gates.

## Performance and final bundle pass

- For performance audits, runtime lifecycles, hydration/RSC, HMR, dependency upgrades, chunk caching, build, or type-inference cost, use the [performance-review skill](skills/performance-review/SKILL.md). It selects the relevant measurements and regression checks.
- **Last phase for every change affecting emitted client JavaScript**, including core/build transforms: complete the full [bundle-size-optimization skill](skills/bundle-size-optimization/SKILL.md) after correctness and performance validation. Apply the workflow to the affected code and its consumers.
