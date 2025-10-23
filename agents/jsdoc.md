# JSDoc Annotations Notes

Scope: Add concise JSDoc to public API in core (`packages/router-core`). We do not add type info in JSDoc (TypeScript handles types). Prefer linking to public docs where helpful. Only annotate publicly documented APIs.

Added annotations (first batch of ~20):

- packages/router-core/src/defer.ts
  - `TSR_DEFERRED_PROMISE`: symbol docs for deferred state carrier
  - `defer`: purpose, behavior, link to docs

- packages/router-core/src/path.ts
  - `exactPathTest`: behavior re trailing slashes
  - `parsePathname`: describes segment parsing + LRU cache

- packages/router-core/src/root.ts
  - `rootRouteId`: stable root identifier

- packages/router-core/src/router.ts
  - `defaultSerializeError`: serializable error shape
  - `trailingSlashOptions`: option docs
  - `getLocationChangeInfo`: path/href/hash comparison
  - `lazyFn`: lazy import helper behavior
  - `getInitialRouterState`: initial state creation
  - `getMatchedRoutes`: matched route chain and params
  - `SearchParamError`, `PathParamError`: error purposes

- packages/router-core/src/process-route-tree.ts
  - `processRouteTree`: build maps and sorted flat list

- packages/router-core/src/ssr/serializer/transformer.ts
  - `createSerializationAdapter`: purpose
  - `makeSsrSerovalPlugin`: server plugin
  - `makeSerovalPlugin`: symmetric plugin

- packages/router-core/src/scroll-restoration.ts
  - `storageKey`: purpose
  - `scrollRestorationCache`: in-memory handle
  - `defaultGetScrollRestorationKey`: description

- packages/router-core/src/searchParams.ts
  - `defaultParseSearch`: default impl doc

- packages/router-core/src/redirect.ts
  - `redirect`: behavior + usage context
  - `isRedirect`, `isResolvedRedirect`, `parseRedirect`: intent

Notes:
- Prioritized core router APIs that appear in public docs (defer, search params helpers, redirect, path helpers, router utilities, SSR serialization hooks, scroll restoration helpers).
- Avoided modifying any existing detailed comment blocks unless adding a short summary header.
- Next likely targets: `composeRewrites`, `executeRewriteInput/Output`, `matchPathname`, `resolvePath`, `interpolatePath`, SSR entrypoints (`createRequestHandler`, JSON helper), and history exports in `@tanstack/history` are already documented in their own package.
