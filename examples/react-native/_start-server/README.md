# `_start-server` — TanStack Start backend for the React Native examples

This is a small Vite + TanStack Start server that the `bare` and
`expo-dev-client` examples consume via `createServerFn` RPC.

The `_` prefix marks it as infrastructure, not an example app itself.

## What it provides

Two server functions in [`src/server-fns.ts`](./src/server-fns.ts):

- `listPosts` — returns the post list
- `getPost` — returns one post by id (with input validation)

Both back onto the mock data in
[`src/utils/posts.ts`](./src/utils/posts.ts). Replace with a real data
source if you adapt this for your own backend.

## Run it

```bash
cd examples/react-native/_start-server
npm install
npm run dev   # http://localhost:3050
```

You can browse the home page at `http://localhost:3050` to see what's
exposed. Server functions live at `/_serverFn/<sha256-id>`.

## How the RN clients reach it

The React Native examples (`bare`, `expo-dev-client`) compile every
`createServerFn(...).handler(...)` call site into a typed RPC stub via
`@tanstack/react-start/plugin/metro`. The compiled client code fetches
`<serverFnBase>/_serverFn/<id>`.

Function ids are deterministic: `sha256(${relativeFilename}--${functionName})`.
The RN client and this server compute the same id from the same source,
so they agree on routing without any manifest exchange.

You configure the base URL in the RN client's `metro.config.js`:

```js
withTanStackStart(config, { serverFnBase: 'http://localhost:3050' })
```

For a physical iOS device on the same Wi-Fi, replace `localhost` with
your Mac's LAN IP (e.g. `http://192.168.1.180:3050`).

## Status

Phase 2 (the RN-side compiler that produces the RPC stubs) currently lives
on a separate branch (`taren/start-metro`) until it can be merged with
the RN router work on `feat/react-native`. This server is ready and
correct in isolation — once the RN-side plugin lands here, the bare and
expo-dev-client examples will start consuming it.
