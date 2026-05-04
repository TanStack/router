# TanStack Router for React Native — Examples

> **`@tanstack/react-native-router` is currently in alpha.**

These examples form a matrix that exercises the supported runtime
combinations. Each example is also designed to serve as an end-to-end test
fixture.

| Example | Bundler runtime | Native build | Router | Start | When to use |
|---|---|---|---|---|---|
| [`bare`](./bare) | Metro (vanilla) | `react-native run-ios` (native iOS project committed) | ✓ | ✓ | You don't want Expo. Maximum control over native code. |
| [`expo-go`](./expo-go) | Metro (Expo's) | None — runs in Expo Go | ✓ | ✗ | Fastest onramp. No Xcode required. Caveat: only works for setups whose native deps are already bundled in Expo Go. |
| [`expo-dev-client`](./expo-dev-client) | Metro (Expo's) | `expo run:ios` (Expo prebuild + custom dev client) | ✓ | ✓ | Expo's developer ergonomics with arbitrary native deps. Recommended for most apps. |

## Matrix legend

- **Router** — `@tanstack/react-native-router` (file-based routing, native
  stack via `react-native-screens`, gesture-back via
  `react-native-gesture-handler`).
- **Start** — `@tanstack/react-start` server functions (`createServerFn`)
  compiled to RPC stubs via `@tanstack/react-start/plugin/metro`. The server
  itself is a separately deployed Vite or Rsbuild Start build.

## Why no Start in `expo-go`?

`expo-go` is constrained to whatever native modules the Expo Go binary on the
device already includes. Start doesn't add native modules, but the typical
Start app uses native deps (`react-native-screens`, `react-native-gesture-handler`)
whose JS↔native versions must match — and the version Expo Go ships with may
drift from the version your `package.json` resolves. The dev-client and bare
flows compile their own binary so the versions always match.

If you only need Router with a minimal native footprint, `expo-go` is the
quickest path. If you need Start, use `expo-dev-client` or `bare`.

## Trying them out

Each example has its own `README.md` with step-by-step instructions. Quick
links:

- [bare/README.md](./bare/README.md)
- [expo-go/README.md](./expo-go/README.md)
- [expo-dev-client/README.md](./expo-dev-client/README.md)

## Common environment notes

When running any example from inside this monorepo:

- **`EXPO_NO_METRO_WORKSPACE_ROOT=1`** — Expo CLI otherwise computes the
  bundle URL relative to the pnpm workspace root, which Metro can't resolve
  back to the entry. Setting this pins the bundle URL to `/index.bundle`.
  (The example npm scripts set it for you.)
- **`LANG=en_US.UTF-8`** — CocoaPods on macOS errors out without a UTF-8
  locale. If your shell doesn't set `LANG`, prefix the build command with
  `LANG=en_US.UTF-8` (only relevant for `bare` and `expo-dev-client`).
- **`.npmrc`** — the workspace root sets
  `public-hoist-pattern[]=@babel/runtime` so Metro can resolve Babel
  helpers via the standard upward `node_modules` walk through pnpm's
  `.pnpm/` layout.
- **Single React copy** — Metro configs in `bare`, `expo-go`, and
  `expo-dev-client` all force a single React + RN copy via
  `extraNodeModules` + `blockList`. Without this, pnpm's nested layout can
  produce duplicate React modules → runtime "Invalid hook call" errors.

## E2E test plan (forthcoming)

These examples will host Maestro flows for navigation + deep linking
verification. Each example folder will gain a `.maestro/` directory with
recorded flows that CI can replay against the iOS simulator.
