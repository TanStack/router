# @tanstack/router-core

## 1.169.1

### Patch Changes

- Fix params.parse inference for discriminated union path params while preserving path key validation. ([#7306](https://github.com/TanStack/router/pull/7306))

## 1.169.0

### Minor Changes

- Allow `params.parse` to experimentally return `false` to skip an incoming route candidate during path matching. Thrown parse errors still surface on the selected match instead of falling through, and outgoing typed route-template links continue to use exact route lookup followed by `params.stringify` for URL generation. ([#7263](https://github.com/TanStack/router/pull/7263))

## 1.168.18

### Patch Changes

- prevent isServer exports from being transformed to top-level vars so rspack can dead-code eliminate them ([#7293](https://github.com/TanStack/router/pull/7293))

## 1.168.17

### Patch Changes

- wildcard nodes have the same priority rules as other nodes in route matching ([#7273](https://github.com/TanStack/router/pull/7273))

## 1.168.16

### Patch Changes

- Add TanStack Start inline CSS manifest support for SSR so route styles can be embedded in the HTML response and hydrated without duplicate stylesheet links. ([#7253](https://github.com/TanStack/router/pull/7253))

## 1.168.15

### Patch Changes

- Fix async loaders that throw or return `notFound()` so they do not briefly mark the match as `success` before the final not-found boundary is resolved. ([#7184](https://github.com/TanStack/router/pull/7184))

  This prevents route components from rendering with missing loader data during navigation when React observes the intermediate match state before not-found finalization completes.

## 1.168.14

### Patch Changes

- chore: bump to h3 v2-rc.20 ([#7140](https://github.com/TanStack/router/pull/7140))

## 1.168.13

### Patch Changes

- Reduce React Start SSR manifest payload size by omitting unmatched route assets from dehydrated router state while keeping start-manifest asset serialization deduplicated by shared object identity. ([#7157](https://github.com/TanStack/router/pull/7157))

  This improves SSR HTML size for apps with many routes that share the same CSS assets and adds regression coverage for CSS module hydration, navigation, and start-manifest asset reuse.

## 1.168.12

### Patch Changes

- avoid false notFound matches for proxied loader data ([#7156](https://github.com/TanStack/router/pull/7156))

## 1.168.11

### Patch Changes

- shorten internal non-minifiable store names for byte shaving ([#7152](https://github.com/TanStack/router/pull/7152))

## 1.168.10

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

## 1.168.9

### Patch Changes

- Preserve component-thrown `notFound()` errors through framework error boundaries so route `notFoundComponent` handlers render without requiring an explicit `routeId`. ([#7077](https://github.com/TanStack/router/pull/7077))

## 1.168.8

### Patch Changes

- Fix preload from continuing into child `beforeLoad` and `head` handlers after a parent `beforeLoad` fails. ([#7075](https://github.com/TanStack/router/pull/7075))

## 1.168.7

### Patch Changes

- Avoid re-running hash scrolling after SSR hydration when later preload or invalidate cycles resolve without a location change. ([#7066](https://github.com/TanStack/router/pull/7066))

## 1.168.6

### Patch Changes

- Fix a regression where browser back/forward navigation could fail to restore the previous scroll position for an existing history entry. ([#7055](https://github.com/TanStack/router/pull/7055))

## 1.168.5

### Patch Changes

- fix: scroll restoration without throttling ([#7042](https://github.com/TanStack/router/pull/7042))

## 1.168.4

### Patch Changes

- tanstack/store 0.9.3 ([#7041](https://github.com/TanStack/router/pull/7041))

## 1.168.3

### Patch Changes

- feat: transformAssets ([#7023](https://github.com/TanStack/router/pull/7023))

## 1.168.2

### Patch Changes

- Replace tiny-invariant and tiny-warning with in-house solution for bundle-size ([#7007](https://github.com/TanStack/router/pull/7007))

## 1.168.1

### Patch Changes

- Update store to 0.9.2 ([#6993](https://github.com/TanStack/router/pull/6993))

## 1.168.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

## 1.167.5

### Patch Changes

- chore: bump esbuild to 0.27.4 ([#6975](https://github.com/TanStack/router/pull/6975))

## 1.167.4

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

## 1.167.3

### Patch Changes

- Fix retained chained router promise refs during route loads and commits. ([#6929](https://github.com/TanStack/router/pull/6929))

## 1.167.2

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/history@1.161.6

## 1.167.1

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/history@1.161.5

## 1.167.0

### Minor Changes

- feat: add staleReloadMode ([#6921](https://github.com/TanStack/router/pull/6921))
