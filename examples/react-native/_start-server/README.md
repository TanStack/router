# `_start-server` — TanStack Start backend for the React Native examples

This is a small Vite + TanStack Start server that the `bare` and
`expo-dev-client` examples consume via `createServerFn` RPC.

The `_` prefix marks it as infrastructure, not an example app itself.

## What it provides

Two server functions in
[`src/server-fns/posts.ts`](./src/server-fns/posts.ts):

- `listPosts` — returns the post list
- `getPost` — returns one post by id (with input validation)

Both back onto the mock data in
[`src/utils/posts.ts`](./src/utils/posts.ts). Replace with a real data
source if you adapt this for your own backend.

## Run it

```bash
cd examples/react-native/_start-server
pnpm install
pnpm run dev     # Vite dev server on http://localhost:3050
pnpm run build
pnpm run start   # built server on http://localhost:3050
```

You can browse the home page at `http://localhost:3050` to see what's
exposed. Server functions live at `/_serverFn/<sha256-id>`.

## How the RN clients reach it

The React Native examples (`bare`, `expo-dev-client`) compile every
`createServerFn(...).handler(...)` call site into a typed RPC stub via
`@tanstack/react-start/plugin/metro`. The compiled client code fetches
`<serverFnBase>/_serverFn/<id>`. The Metro plugin accepts a deployed
server origin, so `serverFnBase: 'http://localhost:3050'` is normalized
to `http://localhost:3050/_serverFn/` in the bundle.

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

The RN-side Metro compiler and this backend are wired together on this
branch. The backend must expose matching `src/server-fns/posts.ts`
handlers so production server function IDs match the RN client source.
