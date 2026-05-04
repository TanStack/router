# React Native + TanStack Router/Start — state of work

This is a living doc tracking what's landed, what's in flight, and what
order to pick things up in. Delete it once the RN work is fully merged
and shipped.

## Branch layout

The work currently lives across **two branches** because of an unfortunate
sequencing accident:

- **`feat/react-native`** (and our derivative `taren/mystifying-nash-aa11f2`)
  — has `@tanstack/react-native-router` and the `@tanstack/router-plugin/metro`
  adapter. Branched from main ~2 months back. Behind main by ~370 commits.
- **`taren/start-metro`** — branched fresh from main. Has the
  `@tanstack/start-plugin-core/metro` adapter and
  `@tanstack/react-start/plugin/metro` wrapper. These depend on the rsbuild
  plugin split on main (PRs #7228 + #7249) which doesn't exist on
  `feat/react-native` yet.

Each branch is consistent and tests green in isolation. Bringing them
together is the sequencing question below.

## What's landed where

### `taren/mystifying-nash-aa11f2` (off feat/react-native)

```
chore(workspace): hoist @babel/runtime so Metro can resolve through pnpm
feat(router-plugin): add Metro adapter (sync withTanStackRouter)
fix(react-native-router): probe TurboModule before loading gesture-handler
feat(examples/react-native): introduce 3-example matrix (bare, expo-go,
                              expo-dev-client) + shared Start server
test(router-plugin/metro): add unit tests for sync withTanStackRouter
test(router-plugin/metro): skip cli-dependent test when router-cli isn't built
docs(react-native): expand Metro plugin guide for both bare and Expo +
                    add example matrix reference
docs(router): register React Native guide in config.json
```

### `taren/start-metro` (off main)

```
feat(router-plugin): add Metro adapter (sync withTanStackRouter)         ← same code as above
feat(start-plugin-core/metro): add Metro adapter for TanStack Start
feat(react-start/plugin/metro): add withTanStackStart Metro wrapper
test(router-plugin/metro): add unit tests for sync withTanStackRouter
test(router-plugin/metro): skip cli-dependent test when router-cli isn't built
```

## Example matrix

Both branches' `examples/react-native/` contain (or, for `start-metro`,
will contain after merge):

| Example | Bundler runtime | Native build | Router | Start |
|---|---|---|---|---|
| `bare` | Metro vanilla | `react-native run-ios` | ✓ | ✓ (planned, post-merge) |
| `expo-go` | Metro (Expo) | None — Expo Go | ✓ | ✗ (skipped — Expo Go can't host arbitrary native) |
| `expo-dev-client` | Metro (Expo) | `expo run:ios` | ✓ | ✓ (planned, post-merge) |

Plus `_start-server/` — a shared Vite Start backend that the RN clients
will RPC into once Phase 2 lands here.

## Phase 1 vs Phase 2

- **Phase 1 = Router**. `@tanstack/router-plugin/metro` (`withTanStackRouter`).
  Sync metro config wrapper that runs the route generator on startup and
  watches for changes. Wired into all 3 examples on
  `mystifying-nash-aa11f2`.
- **Phase 2 = Start**. `@tanstack/start-plugin-core/metro` +
  `@tanstack/react-start/plugin/metro` (`withTanStackStart`). Compiles
  `createServerFn` calls into RPC stubs targeting a deployed Start
  server. Lives on `start-metro` only.

## Sequencing — how to bring this together

Two paths, in order of preferability:

1. **Merge `feat/react-native` → `main` first**, then bring the
   `start-metro` Phase 2 commits onto the merged result. Cleanest. The
   merge is non-trivial (~370 commits divergent, many touch
   `start-plugin-core/`) but it has to happen eventually for the RN
   router to ship.

2. **Cherry-pick Phase 2 onto `mystifying-nash-aa11f2`** as an interim
   measure. Requires also bringing PRs #7228 + #7249 (the rsbuild split)
   so the `start-plugin-core/src/start-compiler/` directory exists and
   the Phase 2 imports resolve. Then the `_start-server/` and example
   sketches in this branch can light up against real code.

Path 1 is the right answer long-term. Path 2 is faster for demoing
end-to-end Start-on-RN before the merge.

## Once merged — finishing the example matrix

Wire `withTanStackStart` into `bare/metro.config.js` and
`expo-dev-client/metro.config.js`:

```js
module.exports = withTanStackRouter(
  withTanStackStart(config, {
    serverFnBase: process.env.TSR_SERVER_FN_BASE ?? 'http://localhost:3050',
  }),
)
```

Add a `src/server-fns/posts.ts` to each (mirroring `_start-server`'s) so
the RN client makes real RPC calls. The deterministic ID hashing means
the client and server agree without extra wiring.

Add Maestro flows that exercise the Start RPC path end-to-end (load a
posts list, tap a post, assert detail rendered).

## Known gotchas (carry forward)

- **`EXPO_NO_METRO_WORKSPACE_ROOT=1`** for any Expo example inside the
  pnpm workspace. Expo otherwise computes the bundle URL relative to
  the workspace root, which Metro can't resolve back to the entry.
  Wired into the `start` script for each Expo example.
- **`LANG=en_US.UTF-8`** required for CocoaPods on macOS shells where
  `LANG` is unset. Documented in each example's README.
- **React/RN dedup** in metro.config.js (extraNodeModules + blockList)
  is essential under pnpm — without it, transitive deps pull in a second
  React copy and the app explodes with "Invalid hook call". The
  `.npmrc` hoist of `@babel/runtime` is the same kind of pnpm-Metro
  bridge.
- **Expo Go ↔ JS version drift** — the gesture-handler / screens /
  Platform-constants TurboModule lookups will fail in Expo Go if the
  bundled native code lags the JS by even a patch version. Use
  `expo-dev-client` (or `bare`) for any non-trivial app.
