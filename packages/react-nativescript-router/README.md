# TanStack React NativeScript Router

`@tanstack/react-nativescript-router` renders a TanStack React Router route
tree through NativeScript's native `Frame`, `Page`, and `ActionBar` primitives.
It does not use a WebView.

## Add a native target

From an existing React app using TanStack Router or TanStack Start:

```sh
npx @tanstack/router-cli@latest native init
```

The command adds the NativeScript resources, entry point, Vite configuration,
scripts, and dependencies. It is idempotent and preflights conflicting files
before writing. It also ignores NativeScript build output and, for pnpm,
merges an explicit build-script policy without replacing workspace settings.
Then run one of:

```sh
npm run native:ios
npm run native:android
```

The current stable toolchain requires React 19, NativeScript 9,
`@nativescript-community/react` 19, a `react-nativescript` npm alias pointing
to that renderer, `@nativescript/vite@2.0.3`, and Vite 7.3 or newer within the
Vite 7 major.
The initializer refuses an existing Vite 8 range unless `--force` is used.

NativeScript Vite 2.0.3 does not register an HMR server for React. Generated
React scripts therefore use its supported `ns debug --no-hmr` workflow. Source
changes rebuild and restart the native app instead of hot-patching it.

## What is shared

Route definitions, generated route types, params, search validation, loaders,
router context, redirects, not-found behavior, navigation blockers, and Start
server functions can be shared with the web app.

DOM elements and CSS are not native views. Pair host-specific screen modules:

```text
src/screens/AccountScreen.tsx
src/screens/AccountScreen-native.tsx
```

An import of `AccountScreen` resolves to the `-native` sibling only in the
NativeScript build. The initializer also creates a native root route so a web
root containing `html`, `head`, and `body` is not loaded by NativeScript.

## Native navigation

Each history entry owns a retained NativeScript `Page` and an independent
Router state snapshot. On iOS, `Page.enableSwipeBackNavigation` drives the
platform's interactive back gesture, including the already-rendered previous
page and native action bar. Registered Router blockers disable the gesture
until navigation is allowed. Android's system back button calls `router.back()`.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  native: ({ params }) => ({
    title: `Post ${params.postId}`,
    gestureEnabled: true,
    animation: 'slide_from_right',
    getId: ({ params }) => `post:${params.postId}`,
  }),
  component: PostRoute,
})
```

Links and imperative navigation support native stack policies:

```tsx
;<Link
  to="/posts/$postId"
  params={{ postId: '42' }}
  stackBehavior="reuse"
  stackMatch="nearest"
/>

await router.back({ to: '/posts/$postId', params: { postId: '42' } })
```

`stackBehavior` accepts `auto`, `push`, `replace`, or `reuse`. Reuse identity
defaults to the complete href, including search and hash, and can be overridden
with `entryId` or route-level `native.getId`.

## Manual setup

The NativeScript Vite config composes the platform renderer with the Router
adapter:

```ts
import { reactConfig } from '@nativescript/vite/react'
import { tanstackReactNativeScript } from '@tanstack/react-nativescript-router/vite'
import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'
import { defineConfig, mergeConfig } from 'vite'

export default defineConfig(({ mode }) =>
  mergeConfig(reactConfig({ mode }), {
    plugins: [
      tanstackReactNativeScript({
        nativeRootRoute: 'src/native/root-route.tsx',
      }),
      tanstackRouterGenerator({ target: 'react' }),
    ],
  }),
)
```

Create and start the router from the native entry:

```tsx
import { startNativeScriptApp } from '@tanstack/react-nativescript-router'
import { getRouter } from '../router'

void startNativeScriptApp({ router: getRouter() })
```

For TanStack Start, use `tanstackStartNativeScript` and configure the native
Start client. See the
[NativeScript Start guide](https://tanstack.com/start/latest/docs/framework/react/guide/nativescript).

## Current scope

- Native push, replace, multi-pop, iOS swipe-back, and Android system back
- Native action bars and route-derived headers
- Search/hash-aware stack identity and targeted back navigation
- Injectable app/universal-link parsing and subscriptions
- Standalone TanStack Start server-function clients
- Native sibling module resolution and a generated native root route

Modal presentation is not part of the first release. NativeScript route edits
may remount the app during development; production navigation is unaffected.

This adapter builds on the NativeScript team's
[`@nativescript/tanstack-router`](https://github.com/NativeScript/tanstack)
experiments and the Router API design from
[React Native pull request #7622](https://github.com/TanStack/router/pull/7622).
