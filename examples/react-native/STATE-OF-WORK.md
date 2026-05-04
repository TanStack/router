# React Native + TanStack Router/Start — state of work

Living doc tracking the unified RN branch. Delete once the work is
merged and shipped.

## Branch: `taren/rn-unified` (off `origin/main`)

Single source of truth. All the RN router + Phase 1 (Metro file routing)
+ Phase 2 (Start RPC transform) work is here, sitting on a fresh main base.
Both `taren/mystifying-nash-aa11f2` and `taren/start-metro` are now
superseded and can be deleted.

## Status

- ✅ `@tanstack/react-native-router` builds against main's signal-based
  router-core (migration commit: `81430ac8bf`)
- ✅ Phase 1 — `@tanstack/router-plugin/metro` sync `withTanStackRouter`
- ✅ Phase 2 — `@tanstack/start-plugin-core/metro` + `@tanstack/react-start/plugin/metro`
  with worker-safe env-var option passing (commit `ccf607e4bc`)
- ✅ 3-example matrix: bare (RN+Router+Start), expo-go (Router only),
  expo-dev-client (RN+Router+Start)
- ✅ Shared `_start-server` (Vite+Start backend) ready to consume RPCs
- ✅ Maestro flow skeletons
- ✅ Docs + sidebar registration
- ✅ Defensive gesture-handler TurboModule probe
- ✅ Unit tests (router-plugin/metro: 4 new, react-native-router: 6 pre-existing)

## End-to-end Start RPC verified at the bundle level

Running `npx react-native start` (bare) and `expo start` (expo-dev-client)
each produce iOS bundles containing:

- `createClientRpc` references for each `createServerFn` call site
- Deterministic SHA-256 function ids: `c299b00d...` (listPosts) and
  `d4f35c53...` (getPost)

Identical IDs across both clients prove the deterministic hashing —
a single deployed Start server can serve both bundlers without any
per-client manifest exchange.

What's NOT verified yet: actually running the iOS app and confirming
RPC roundtrips against `_start-server`. The bundle-level proof is
mechanical (the transformer is wiring through correctly). The runtime
test would be: `cd _start-server && npm run dev` (port 3050), launch
either RN client in the sim, navigate to /posts, expect data from the
local server.

## Example matrix

| Example | Bundler | Native | Router | Start |
|---|---|---|---|---|
| `bare` | Metro vanilla | iOS + Android (committed) | ✓ | ✓ |
| `expo-go` | Metro (Expo) | Expo Go | ✓ | n/a |
| `expo-dev-client` | Metro (Expo) | Expo prebuild | ✓ | ✓ |
| `_start-server` | Vite (Start) | n/a | n/a | ✓ |

## Known things the rebase exposed

(All resolved in this branch — listing for handoff context.)

1. `@tanstack/config/vite` was renamed to `@tanstack/vite-config` on
   main. RN router's `vite.config.ts` updated.
2. `verboseFileRoutes` config was removed from main's router-generator.
   The `react-native` target in `template.ts` now uses the same
   `serializeRoutePath()` pattern as react/solid/vue.
3. `RouterState` lost `pendingMatches` and `cachedMatches`; they're now
   separate stores on `router.stores`. The RN router's transition
   rendering subscribes to `router.stores.pendingMatches` via
   `useStore` and combines with the routerState selector.
4. `router.__store` moved to `router.stores.__store`.
5. `getLocationChangeInfo` signature changed — now takes
   `ParsedLocation` arguments, not a full `RouterState`.
6. Metro's transformer worker pool doesn't share module-level state
   with the main process. Phase 2's transformer.cjs was reworked to
   pass options through `process.env.TSR_START_METRO_OPTIONS` (env
   vars DO propagate to jest-worker children).

## What's left before merge

- Run the actual RPC roundtrip in the simulator (mechanical; needs
  `_start-server` brought up + Maestro flow update to assert real data
  is rendered).
- Address pre-existing eslint warnings on `react-native-router` (37
  errors, 6 warnings — all stylistic, none functional). These existed
  on `feat/react-native` and didn't get cleaned up before the merge.
- Decide on the `expo-go` story for actually working in Expo Go —
  currently bundles cleanly but real-app testing hit native module
  version drift. Defensive probes help, but the example is more useful
  as documentation of what's possible than as a recommended path.
