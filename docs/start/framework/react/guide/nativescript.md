---
id: nativescript
title: NativeScript
---

TanStack Start can compile the React client side of a Start app for NativeScript
while the normal Start server remains deployed as the server-function host.
Route definitions, loaders, params, search state, and server functions are
shared with the web client. Screen rendering uses native iOS and Android views.

Read the [Router NativeScript integration](../../../../router/integrations/nativescript.md)
for native stack behavior and route options.

## Initialize

From a React Start app:

```sh
npx @tanstack/router-cli@latest native init
```

The generated development scripts start the Start server and NativeScript app
together:

```sh
npm run native:ios
npm run native:android
```

NativeScript Vite 2.0.3 does not register an HMR server for React, so these
scripts use `ns debug --no-hmr`. Source changes rebuild and restart the native
app instead of hot-patching it.

The Android emulator reaches the host server through `10.0.2.2`. The iOS
simulator uses `127.0.0.1`. A physical device needs a reachable LAN or deployed
URL.

## Compiler setup

The generated `vite.native.config.ts` composes NativeScript React with Start's
standalone native client compiler:

```ts
import { reactConfig } from '@nativescript/vite/react'
import { tanstackStartNativeScript } from '@tanstack/react-start/plugin/nativescript'
import { defineConfig, mergeConfig } from 'vite'

export default defineConfig(({ mode }) =>
  mergeConfig(reactConfig({ mode }), {
    plugins: [
      tanstackStartNativeScript({
        serverFnBase:
          mode === 'production'
            ? process.env.TSS_SERVER_FN_BASE!
            : 'http://127.0.0.1:3000/_serverFn/',
        serverFnMode: mode === 'production' ? 'build' : 'dev',
        nativeRootRoute: 'src/native/root-route.tsx',
      }),
    ],
  }),
)
```

`serverFnBase` must be an absolute HTTP or HTTPS URL ending at the Start
server-function endpoint. A production app must use the deployed server URL;
the compiler rejects a relative URL.

The plugin performs three jobs:

- generates the shared React route tree
- applies the NativeScript renderer and `-native` module resolver
- runs Start's client transform with the same deterministic server-function IDs
  used by the deployed Start server

Server handler bodies are removed from the native client bundle and replaced
with RPC calls.

## Native entry

Initialize Start's native fetch behavior before mounting the router:

```tsx title="src/native/index.tsx"
import { startNativeScriptApp } from '@tanstack/react-nativescript-router'
import { configureNativeScriptStart } from '@tanstack/react-start/nativescript'
import { getRouter } from '../router'

void startNativeScriptApp({
  router: getRouter(),
  initialize: () => configureNativeScriptStart(),
})
```

`configureNativeScriptStart` installs a native-safe server-function fetch
wrapper, including the `Origin` header expected by Start's CSRF validation.

## Server functions

No native-specific server-function definition is required:

```ts
import { createServerFn } from '@tanstack/react-start'

export const getAccount = createServerFn({ method: 'GET' }).handler(async () =>
  loadAccount(),
)
```

The web build keeps normal Start behavior. In the NativeScript build, app
imports of `@tanstack/react-start` resolve to the native client entry and calls
are sent to `serverFnBase`.

## Production builds

Set the deployed endpoint before invoking a generated build script:

```sh
TSS_SERVER_FN_BASE=https://app.example.com/_serverFn/ npm run native:build:ios
TSS_SERVER_FN_BASE=https://app.example.com/_serverFn/ npm run native:build:android
```

The generated scripts pass NativeScript's `--release` flag. Android release
builds require all four `--key-store-*` options, which can be appended after
`npm run native:build:android --`. Add `--for-device` and the appropriate iOS
signing options when producing an iOS device build.

NativeScript platform signing, App Store configuration, Android manifests, and
device permissions remain standard NativeScript responsibilities. The
initializer copies the official NativeScript iOS and Android resource template
as a starting point.
