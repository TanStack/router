---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

fix(start-plugin-core): move rsbuild exports to dedicated `/rsbuild` subpath

Because `./rsbuild/planning` (and transitively `./rsbuild/plugin`) statically
imports `mergeRsbuildConfig` from `@rsbuild/core`, re-exporting them from the
package root entry caused Vite-only consumers (who reach the root entry via
`@tanstack/*-start/plugin/vite`) to fail at load time with
`ERR_MODULE_NOT_FOUND: Cannot find package '@rsbuild/core'` — even though
`@rsbuild/core` is an optional peer.

The root entry is now Vite-only. All rsbuild-specific value and type exports
(`tanStackStartRsbuild`, `RSBUILD_ENVIRONMENT_NAMES`,
`TanStackStartRsbuildInputConfig`, `TanStackStartRsbuildPluginCoreOptions`) are
available from the new `@tanstack/start-plugin-core/rsbuild` subpath, matching
the existing convention used by `@tanstack/router-plugin`
(`./vite`, `./rspack`, `./webpack`, `./esbuild`) and the pre-existing
`@tanstack/start-plugin-core/rsbuild/types` subpath.

`@tanstack/{react,solid,vue}-start/plugin/rsbuild` are updated internally to
import from the new subpath. No changes are required for end users who consume
these framework-specific rsbuild entries.

Closes #7247
