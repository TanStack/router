---
name: File-based routing API
description: Configuration options for file-based routing generation.
version: 1
source: docs/router/api/file-based-routing.md
---

# File-based routing API

## Core options

- `routesDirectory` sets the routes directory (default `./src/routes`).
- `generatedRouteTree` sets the output file (default `./src/routeTree.gen.ts`).
- `routeToken` and `indexToken` customize naming tokens.
- `routeFilePrefix`, `routeFileIgnorePrefix`, and `routeFileIgnorePattern` control discovery.

## Output options

- `quoteStyle`, `semicolons`, and `enableRouteTreeFormatting` control formatting.
- `disableTypes` switches to JS output.
- `autoCodeSplitting` is plugin-only (default false).

## Virtual routing

- `virtualRouteConfig` sets the virtual route config location.

## Use cases

- Customize route discovery and tokens
- Change the generated route tree output path
- Enable auto code splitting via the plugin

## Notes

- Avoid token/prefix settings that conflict with route naming conventions.
- `autoCodeSplitting` is plugin-only.

## Examples

```ts
tanstackRouter({
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeToken: 'route',
  indexToken: 'index',
  autoCodeSplitting: true,
})
```
