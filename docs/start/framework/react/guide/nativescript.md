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

NativeScript 9.1 integrates the Vite dev server, including HMR, directly into
the CLI, so the generated scripts are plain `ns debug` commands:

```sh
npm run ios
npm run android
```

Run the normal Start dev server (`npm run dev`) in a second terminal when
screens call server functions during development; it hosts them on the
configured Start port.

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

Set the deployed endpoint before invoking a release build:

```sh
TSS_SERVER_FN_BASE=https://app.example.com/_serverFn/ ns build ios --release
TSS_SERVER_FN_BASE=https://app.example.com/_serverFn/ ns build android --release
```

Android release builds require all four `--key-store-*` options. Add
`--for-device` and the appropriate iOS signing options when producing an iOS
device build.

NativeScript platform signing, App Store configuration, Android manifests, and
device permissions remain standard NativeScript responsibilities. The
initializer copies the official NativeScript iOS and Android resource template
as a starting point.
