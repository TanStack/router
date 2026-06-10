# 023 — SSR: `router.update()` runs 3× per request; the third re-parses the location for one context key

|                 |                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| Area            | `packages/start-server-core/src/createStartHandler.ts`, `packages/router-core/src/router.ts` |
| Benchmarks      | ssr (react)                                                                                  |
| Expected impact | Small-medium (~1-2% of request CPU; more for apps with expensive custom `parseSearch`)       |
| Confidence      | High on mechanism, medium on win size                                                        |
| Risk            | Low-medium                                                                                   |
| Prior art       | none found                                                                                   |

## Problem

Per SSR request, `RouterCore.update()` runs three times:

1. In the `RouterCore` constructor (`router.ts:1024`) — unavoidable.
2. In `createStartHandler`'s `getRouter` (`createStartHandler.ts:466-479`) — necessary: sets history, triggers the only needed `parseLocation`.
3. At `createStartHandler.ts:587` — `routerInstance.update({ additionalContext: { serverContext } })` — exists **only to inject one context key**, yet `update()` (`router.ts:1056-1214`):
   - re-spreads all options (`:1076-1079`),
   - rebuilds the `protocolAllowlist` `Set` (`:1083`),
   - calls `updateLatestLocation()` (`:1117-1119`) → a full `parseLocation` on the **same href**, including a `parseSearch` + `stringifySearch` round trip (and, pre-[001](001-search-params-json-parse-exception-storm.md), JSON.parse throws).

Profile: `RouterCore.update` 0.6% self + constructor 0.7% + the redundant parse work.

## Proposed approach

Pick one:

- **(a)** In `executeRouter`, set the key directly: `routerInstance.options.additionalContext = { serverContext }`. It is only consumed via `this.options.additionalContext` (`load-matches.ts:487`). Smallest diff; bypasses `update()` side effects for this key (fine today — verify no other consumer).
- **(b)** Add a fast path in `update()` that skips `updateLatestLocation`, the Set rebuild, and basepath logic when none of `history`/`routeTree`/`basepath`/`rewrite`/`protocolAllowlist` changed. More general (also helps client HMR-ish update calls), needs a careful key whitelist.
- (c) Passing `additionalContext` through update #2 is **not** possible — middleware context resolves later in the request.

## Risks & constraints

- (a) couples start-server-core to the options-mutation detail; add a comment or a tiny dedicated router method (`router.setAdditionalContext(ctx)`) if preferred.
- (b) touches shared code — keep the guard byte-cheap (client bundle).

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit
# e2e start tests cover server context propagation:
# verify additionalContext/serverContext reaches beforeLoad/loaders in start e2e suites
```
