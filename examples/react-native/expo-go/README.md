# `expo-go` — TanStack Router via Expo Go (no native build)

This example runs `@tanstack/react-native-router` inside the **Expo Go** app
on the simulator — no Xcode, no `expo run:ios`, no CocoaPods. Smallest
possible onramp.

## Why this example exists

Demonstrates that Router itself doesn't require a custom native build.
You can start exploring TanStack Router on RN with just Expo CLI and the
Expo Go app from the App Store.

## Trade-offs

Expo Go ships a fixed set of native modules baked in. Two consequences:

- **No Start integration.** Server functions don't add native modules per
  se, but most Start apps end up using libs that need version-matched
  native code. For Start, use [`expo-dev-client`](../expo-dev-client) or
  [`bare`](../bare).
- **Native module version drift.** If your `package.json` resolves
  `react-native-gesture-handler` (or similar) to a version newer than what
  Expo Go was built with, you may see `TurboModuleRegistry.getEnforcing`
  errors. The `@tanstack/react-native-router` package includes defensive
  probes that gracefully fall back to View-based rendering when a native
  module isn't present, so the app still loads — just without those
  features.

If you hit a runtime error you can't work around, switch to
`expo-dev-client` (a one-time native build) and your problem class
disappears.

## First-time setup

```bash
cd examples/react-native/expo-go

# Install JS deps (handled by workspace root; included for clarity)
pnpm install
```

## Running on the iOS simulator

```bash
# Boot a sim (one-time)
xcrun simctl boot "iPhone 17 Pro"
open -a Simulator

# Install Expo Go in the sim (one-time, if not already there)
brew install --cask expo-go
xcrun simctl install booted "/Applications/Expo Go.app"

# Start Metro
npm run start

# Open the app in Expo Go
xcrun simctl openurl booted "exp://localhost:8125"
```

## Deep linking (`tsrgo://`)

```bash
xcrun simctl openurl booted "tsrgo:///about"
xcrun simctl openurl booted "tsrgo:///posts/1"
```

## What's inside

```
expo-go/
├── App.tsx               # Root: SafeAreaProvider + NativeRouterProvider
├── app.json              # Expo config
├── babel.config.js       # babel-preset-expo
├── index.js              # registerRootComponent (Expo)
├── metro.config.js       # expo/metro-config + workspace dedup
└── src/
    ├── router.ts         # tsrgo:// linking
    └── routes/           # __root, index, about, posts, posts/$postId
```
