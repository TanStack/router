# Link Performance Investigation

Date: 2026-03-20

## Goal

Investigate how to reduce unnecessary `Link` work when the current router location changes, especially when `location.search` changes but a link's next location does not actually depend on current search.

The main target is React, because React `Link` rerenders are the expensive case. Solid and Vue still matter for avoiding wasted `buildLocation` calls, but rerender pressure is much lower there.

## What I Read

- Adapter `Link` implementations:
  - `packages/react-router/src/link.tsx`
  - `packages/solid-router/src/link.tsx`
  - `packages/vue-router/src/link.tsx`
- Router-core location building and matching:
  - `packages/router-core/src/router.ts`
  - `packages/router-core/src/location.ts`
  - `packages/router-core/src/path.ts`
  - `packages/router-core/src/RouterProvider.ts`
- React location update lifecycle:
  - `packages/react-router/src/Transitioner.tsx`
- Existing and new benchmarks:
  - `benchmarks/client-nav/react/app.tsx`
  - `benchmarks/client-nav/react/setup.ts`
  - `benchmarks/client-nav/react/speed.bench.ts`

## What We Know

- `buildLocation` is expensive.
- The old `Link` behavior rebuilt `next` whenever the full current location changed.
- Many links do not need current `location.search` to compute `next`.
- Most users do not set `activeOptions={{ includeSearch: false }}`.
- For the common default `includeSearch: true` case, skipping `buildLocation` can still help even if React still rerenders to recompute `isActive`.

## Lifecycle: History -> Router -> Link -> buildLocation

1. Browser/history location changes.
2. React `Transitioner` subscribes history to `router.load()`.
3. `router.beforeLoad()` updates `router.stores.location` early, before all route loading finishes.
4. Every `Link` that subscribes to `router.stores.location` gets that update.
5. If a `Link` decides the new location matters, React rerenders the component.
6. During render, `Link` calls `router.buildLocation(...)` to compute `next`.
7. `buildLocation` does all of the following:
   - resolves the current route context from the current location
   - computes `from` / `to`
   - resolves and stringifies params
   - matches destination routes
   - applies search middleware / legacy search filters / validateSearch
   - computes hash, state, href, publicHref, and masked location
8. `Link` then computes `href` and `isActive` from the current location and the built `next` location.

## How `location`, `buildLocation`, and `Link` Fit Together

- `router.stores.location` is the reactive trigger.
- `Link` is the consumer that decides whether a location update matters.
- `buildLocation` is the expensive derivation step used to compute `next`.
- The key optimization problem is not only "what does a link depend on?".
- The real problem is "how do we know the dependency set without spending enough work to cancel out the win?".

## Attempt 1: Adapter-Local Dependency Analysis in React/Solid/Vue

### Shape

- Split each adapter into two subscriptions:
  - one for `next` / `buildLocation`
  - one for `isActive`
- Add adapter-local helper logic to infer whether current pathname/search/hash/state matter.
- Duplicate route matching logic in each adapter to decide whether current search matters because of destination search middleware.

### What Worked

- Narrow tests passed.
- Search-only changes could skip `buildLocation` for static-search links.

### What Failed

- Too much duplicated code across adapters.
- Bundle size increased noticeably.
- The existing mixed client-nav benchmark did not improve.
- React became slightly slower in the broad benchmark.

### Conclusion

This approach was the wrong abstraction boundary. It moved expensive reasoning into adapter space and duplicated route analysis three times.

## Attempt 2: React-Only Single Subscription + Core Dependency Metadata

### Shape

- Revert Solid and Vue back to the simpler baseline behavior.
- Keep React-focused optimization only.
- Add an internal `_collectLocationDeps` option to `buildLocation`.
- While `buildLocation` is already resolving the destination route branch, compute a tiny dependency bitmask for the fields that matter:
  - pathname / current route context
  - search
  - hash
  - state
- In React `Link`:
  - keep a single `useStore` subscription to `router.stores.location`
  - cache the previous built `next` location plus the dependency bitmask
  - rebuild only when a location change intersects the cached dependency bitmask
  - still rerender when active-state inputs change, but reuse cached `next`

### Why This Is Better

- No duplicated route matching in adapter code.
- Only one React store subscription.
- Search dependency is determined from the same work `buildLocation` already does.
- The common default case can still skip `buildLocation` even when `isActive` must be recomputed.

## Important Correctness Fix During Investigation

While rerunning affected unit tests, `packages/react-router/tests/link.test.tsx` surfaced a regression in the existing test:

- `keeps a relative link active when changing inherited params (issue #5655)`

Cause:

- The first dependency-mask version missed the fact that omitted `params` still inherit current params when `nextTo` contains path params.

Fix:

- Mark pathname as a dependency when params are inherited/merged and the resolved `nextTo` path template contains `$` params.

## What Is Currently In Code

- React-only optimization:
  - `packages/react-router/src/link.tsx`
- Core dependency metadata support:
  - `packages/router-core/src/router.ts`
  - `packages/router-core/src/RouterProvider.ts`
- New React benchmark scenario:
  - `benchmarks/client-nav/react/app.tsx`
  - `benchmarks/client-nav/react/setup.ts`
  - `benchmarks/client-nav/react/speed.bench.ts`
- React tests:
  - `packages/react-router/tests/link.test.tsx`

Solid and Vue were intentionally restored to the baseline implementation for now.

## Benchmark Design

### Existing Benchmark

The original `client-nav` benchmark changes pathname every navigation and changes search every other navigation. That is a broad benchmark, but it does not isolate the search-only optimization target.

### New Benchmark

Added a second React scenario: `client-side navigation loop with static search links (react)`.

Shape:

- Stable pathname: `/links`
- Current search changes every tick
- 200 rendered `Link`s
- Each `Link` has static `search={{ linkId: ... }}`

This isolates the intended search-only invalidation case.

## Benchmarks I Ran

### Validation / Build Commands

- `CI=1 NX_DAEMON=false pnpm nx run @tanstack/react-router:test:eslint --outputStyle=stream --skipRemoteCache`
- `CI=1 NX_DAEMON=false pnpm nx affected --target=test:eslint --exclude=examples/**,e2e/** --outputStyle=stream --skipRemoteCache`
- `CI=1 NX_DAEMON=false pnpm nx affected --target=test:types --exclude=examples/** --outputStyle=stream --skipRemoteCache`
- `CI=1 NX_DAEMON=false pnpm nx affected --target=test:unit --exclude=examples/**,e2e/** --outputStyle=stream --skipRemoteCache`
- `CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache`
- `CI=1 NX_DAEMON=false pnpm nx run @benchmarks/bundle-size:build --outputStyle=stream --skipRemoteCache`

### Focused React Tests

- `CI=1 NX_DAEMON=false pnpm nx run @tanstack/react-router:test:unit --outputStyle=stream --skipRemoteCache -- tests/link.test.tsx -t "does not rebuild static next locations on unrelated search changes"`
- `CI=1 NX_DAEMON=false pnpm nx run @tanstack/react-router:test:unit --outputStyle=stream --skipRemoteCache -- tests/link.test.tsx -t "keeps a relative link active when changing inherited params \(issue #5655\)"`

### Main Comparison Method

- Created a temporary detached worktree at `origin/main`
- Installed deps there
- Ran the same React benchmarks on `main`
- Compared current branch vs `main`

## Measurements

### Mixed React client-nav benchmark

Current implementation vs `main`:

- `main`: `38.78 hz`, mean `25.79 ms`
- current: `36.33 hz`, mean `27.53 ms`
- Result: still slightly worse in the broad benchmark (`-6.3%` throughput in the latest run)

Interpretation:

- The mixed benchmark is still dominated by cases where pathname changes and links legitimately need work.
- The new optimization does not materially help this broad scenario yet.

### Search-only benchmark, with `activeOptions={{ includeSearch: false }}`

Current implementation vs `main`:

- `main`: `16.42 hz`, mean `60.92 ms`
- current: `27.03 hz`, mean `37.00 ms`
- Result: `+64.7%` throughput, `-39.3%` mean time

Interpretation:

- This is the ideal case: current search changes do not matter to `next` or `isActive`.
- The optimization skips both `buildLocation` and React rerender work.

### Search-only benchmark, default `includeSearch: true`

Follow-up work narrowed active-search dependency tracking for static-search links so React no longer subscribes to the full current search object in the common partial-match case.

The active-state dependency now distinguishes:

- no current-search dependency
- selected current-search keys only
- selected current-search keys plus exact current-search entry count

That means common links such as `search={{ page: 0 }}` with default `includeSearch: true` only react to current `page`, not unrelated current search keys.

Current implementation vs `main`:

- `main`: `14.46 hz`, mean `69.16 ms`
- current: `20.28 hz`, mean `49.31 ms`
- Result: `+40.2%` throughput, `-28.7%` mean time

Interpretation:

- The default `includeSearch: true` case now benefits much more because React can skip rerenders when unrelated current search keys change.
- React still rerenders when the selected search keys or exact-search key count can affect `isActive`.
- The remaining work is now much closer to the true semantic dependency of active-state matching.

### Bundle size

Current implementation vs `main`:

- `react-router.minimal`: `90682 -> 91531 gzip` (`+849 B`, `+0.94%`)
- `react-router.full`: `93928 -> 94779 gzip` (`+851 B`, `+0.91%`)

Interpretation:

- The core-assisted React-only approach is still larger than `main`, but much better than the original three-adapter duplicated approach.
- Replacing the hidden dependency metadata property with an internal `_locationDeps` target simplified the implementation, but it did not materially reduce the emitted React bundle on its own.

## What Worked

- Moving dependency analysis into `buildLocation` instead of duplicating route matching in adapters.
- Returning a tiny internal dependency mask instead of a large metadata object.
- Using one React store subscription and cached built locations.
- Adding a search-only benchmark that actually measures the intended optimization target.

## What Did Not Work

- Per-adapter duplicated dependency analysis.
- Two subscriptions per `Link` in all adapters.
- Expecting the broad mixed client-nav benchmark to show the targeted search-only win.

## Current Understanding

- The optimization target is real.
- The common-case default `includeSearch: true` can benefit substantially when a static-search link only depends on a small subset of current search keys.
- The biggest win appears when search changes affect neither `next` nor `isActive`.
- The current mixed benchmark suggests there is still a larger amount of unavoidable pathname-driven work in the general case.

## Open Questions / Next Steps

1. Can the remaining React/client-nav regression be explained by unavoidable pathname work, or is there still avoidable `Link` overhead in the mixed benchmark?
2. Can the dependency metadata be compressed further without giving up the selected-key / key-count active-search win?
3. Should the same core-assisted pattern eventually be extended to Solid and Vue, or is React the only adapter worth optimizing at this level?

## Practical Status

- React-only optimization is implemented and benchmarked.
- Narrow correctness regressions are covered by tests.
- Affected eslint, affected type tests, and affected unit tests pass.
- A draft PR is appropriate because the targeted benchmark win is strong, but the broad benchmark remains flat/slightly worse and the bundle is still somewhat larger than `main`.
