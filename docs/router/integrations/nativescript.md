---
id: nativescript
title: NativeScript
---

`@tanstack/react-nativescript-router` runs a React Router route tree in a
NativeScript application using native iOS and Android views. It is not based on
a WebView.

## Quick start

Run the initializer from an existing React Router or TanStack Start app:

```sh
npx @tanstack/router-cli@latest native init
```

The command detects the router module and whether the app uses Start, then adds
the NativeScript resources, entry point, Vite config, scripts, and dependencies.
It does not overwrite conflicting managed files unless you pass `--force`.
For pnpm projects it also merges the narrowly scoped build-script policy needed
by NativeScript and Vite into the nearest `pnpm-workspace.yaml`. Existing
workspace settings and explicit denials are preserved.

```sh
npm run native:ios
npm run native:android
```

Requirements for the current stable NativeScript toolchain:

- React 19
- NativeScript 9
- `@nativescript-community/react` 19
- `react-nativescript` as an npm alias of `@nativescript-community/react` 19
- `@nativescript/vite` 2.0.3
- Vite 7.3 or newer within the Vite 7 major

NativeScript's stable Vite plugin does not currently support Vite 8. The
initializer adds a compatible Vite version when one is absent and reports a
conflict for an existing incompatible range. `--force` deliberately replaces
that range.

## Sharing an app

The generated route tree and these behaviors can be shared:

- route paths and type registration
- path params and search params
- loaders and router context
- redirects, not-found results, and blockers
- TanStack Start server functions

NativeScript does not translate DOM elements or CSS into native controls. Keep
route modules thin and put host UI in sibling screen modules:

```text
src/screens/SettingsScreen.tsx
src/screens/SettingsScreen-native.tsx
```

```tsx title="src/routes/settings.tsx"
import { createFileRoute } from '@tanstack/react-router'
import { SettingsScreen } from '../screens/SettingsScreen'

export const Route = createFileRoute('/settings')({
  loader: loadSettings,
  component: () => <SettingsScreen settings={Route.useLoaderData()} />,
  native: {
    title: 'Settings',
    headerLargeTitle: true,
  },
})
```

The native Vite resolver selects `SettingsScreen-native.tsx`. It also replaces
the web root route with `src/native/root-route.tsx`, so a Start document root
containing `html`, `head`, and `body` is never evaluated by the native app.

## Native stack behavior

The adapter maps Router history to a NativeScript `Frame`. Every stack entry
owns a real `Page` and an independent snapshot of its complete matched route
tree. This has two important effects:

- iOS interactive swipe-back reveals the already-rendered previous page.
- Hooks on retained pages continue to read that page's location, params,
  search, matches, loader data, and route context.

NativeScript's `Page.enableSwipeBackNavigation` supplies the iOS gesture.
Navigation blockers disable it while a blocker is registered. Android's system
back event is routed through `router.back()`.

Absolute `http`, `https`, `mailto`, and `tel` links open through NativeScript's
platform URL handler. Override `native.openExternalUrl` on the router for a
custom host integration. Relative links, including `reloadDocument` links
shared with a web app, remain native stack navigations.

### Route options

Native route options inherit through matched parents. A child overrides fields
defined by an ancestor.

```tsx
export const Route = createFileRoute('/messages/$threadId')({
  native: ({ params }) => ({
    title: `Thread ${params.threadId}`,
    headerShown: true,
    headerBackVisible: true,
    gestureEnabled: true,
    animation: 'slide_from_right',
    getId: ({ params }) => `thread:${params.threadId}`,
    stackMatch: 'nearest',
  }),
})
```

Supported options include:

- `title`, `headerShown`, `headerBackVisible`, and `headerBackTitle`
- `headerLargeTitle`, `headerStyle`, and a custom native `header`
- `gestureEnabled`, `animated`, `animation`, and `transition`
- `getId` and `stackMatch`

### Link and navigate options

```tsx
<Link
  to="/messages/$threadId"
  params={{ threadId: '42' }}
  stackBehavior="reuse"
  stackMatch="nearest"
/>
```

`stackBehavior` values:

- `auto`: use normal Router push/replace behavior
- `push`: always add an entry
- `replace`: replace the current entry
- `reuse`: pop to a matching entry, replace the matching current entry when
  its href changes, or push when no entry matches

Reuse identity defaults to the complete href, including search and hash. Pass
`entryId`, or define route-level `native.getId`, for domain-specific identity.

Targeted back navigation uses the same history model:

```ts
await router.back({ steps: 2 })
await router.back({ to: 'root' })
await router.back({ to: '/messages/$threadId', params: { threadId: '42' } })
```

A route target can use `ifMissing: 'push' | 'replace' | 'noop'`.

## Manual provider setup

The initializer is recommended. A manual native entry looks like this:

```tsx title="src/native/index.tsx"
import { startNativeScriptApp } from '@tanstack/react-nativescript-router'
import { getRouter } from '../router'

void startNativeScriptApp({ router: getRouter() })
```

The Vite integration aliases app imports of `@tanstack/react-router` to the
native adapter, keeps one React runtime, provides the NativeScript renderer
bridge, resolves `-native` siblings, and runs file-route generation.

For server functions, continue with the
[NativeScript Start guide](../../start/framework/react/guide/nativescript.md).

## Deep links

Deep-link sources differ between NativeScript app configurations, so the
adapter accepts injected initial-URL and subscription functions:

```ts
const router = createRouter({
  routeTree,
  native: {
    linking: {
      prefixes: ['myapp://', 'https://example.com'],
      getInitialURL,
      subscribe: subscribeToIncomingURLs,
      initialMode: 'replace',
      incomingMode: 'push',
    },
  },
})
```

## Scope

The first release covers native push/replace/pop navigation, interactive back,
native headers, deep-link plumbing, Router blockers, and Start server functions.
Modal route presentation is deferred until it has a separately tested native
state machine. Development route edits may cause a full NativeScript remount.

The implementation incorporates lessons and primitives from the NativeScript
team's [`@nativescript/tanstack-router`](https://github.com/NativeScript/tanstack)
work and the stack API design in
[React Native pull request #7622](https://github.com/TanStack/router/pull/7622).
