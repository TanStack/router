---
'@tanstack/router-plugin': minor
'@tanstack/router-utils': patch
---

Route code splitting and route HMR now run on the Yuku compiler core instead of Babel.

- Any route option value is split: identifiers, inline functions, casts, `satisfies`, calls such as `memo(Page)`, method shorthands, object-form loaders (their `handler`), and options held in a module-level constant. Options the route module still reads stay declared there and the chunks import them (one instance everywhere); top-level writes stay with the binding they write; pure code read by several chunks loads lazily from a shared module.
- `createFileRoute` & co. are recognised by their import binding (aliases, type arguments, `createRootRouteWithContext<Ctx>()`); routes whose options cannot be read statically are reported once per file instead of being silently left alone.
- Root routes split their `errorComponent` and `notFoundComponent`; the root `component` stays eager.
- `deleteNodes` removes every property form (methods, string keys, options in casts) and what only they imported.
- Route CSS (`import './route.css'`) loads with the route's split component chunks when every component option of the route is split.
- Route HMR emits a literal `import.meta.hot.accept(` (Vite) or `import.meta.webpackHot.accept()` and calls the framework's `__tsrRouteHmr` helper; split components keep their lazy wrapper identity across updates in React, Solid and Vue; inline, lowercase, `memo(...)`, `forwardRef(...)` and method-shorthand components are registered for React Refresh; `.ts` route modules and apps without `@vitejs/plugin-react` hot-update.
- Production output is decided by the bundler's mode, never by `process.env.NODE_ENV` of the plugin process, and is byte-identical to an `addHmr: false` build.
- Rspack and webpack use the plugin's own loader: source maps compose with earlier loaders and name the route file; derived module ids resolve relative to the route file (paths with `#`, `'` or spaces work).
- esbuild refuses `autoCodeSplitting` with a clear error; the generator keeps working there.
- Removed: `codeSplittingOptions.compilerPlugins` (the Babel plugin hook) and the `@babel/*` dependencies of `@tanstack/router-plugin`. New entry `@tanstack/router-plugin/planners` exposes the route planners for TanStack Start's compiler host.
