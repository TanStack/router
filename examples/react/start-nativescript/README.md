# TanStack Start + NativeScript

This example uses one generated route tree for a TanStack Start web app and a
NativeScript React app. Route definitions, params, search validation, loaders,
and server functions are shared. Web and NativeScript screen modules are paired
with the `*-native.tsx` convention.

```sh
pnpm dev
pnpm native:ios
pnpm native:android
```

The native commands start the Start development server and the NativeScript
debug build together. Production native builds run in release mode and must set
`TSS_SERVER_FN_BASE` to the absolute HTTPS server-function endpoint. Android
release builds also require NativeScript's four `--key-store-*` signing
arguments.

NativeScript renders native `Frame`, `Page`, `ActionBar`, and layout views. It is
not a WebView. iOS interactive swipe-back is provided by the native `Page`
navigation stack. Each retained page renders from its own Router state snapshot,
so its header, search params, loader data, and nested matches remain available
during the gesture.

The web root route is replaced only in the native bundle. Imports such as
`screens/HomeScreen` resolve to `HomeScreen-native.tsx`, while route and server
modules stay shared. This is the intended migration boundary: DOM and CSS are
not translated into NativeScript controls.

The stable NativeScript Vite 2 integration currently requires Vite 7. This
example pins Vite 7.3.6 while the rest of the monorepo can use Vite 8.
