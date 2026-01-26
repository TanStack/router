---
name: File naming conventions
description: Tokens and rules for file-based routing names.
version: 1
source: docs/router/framework/react/routing/file-naming-conventions.md
---

# File naming conventions

## Required files and tokens

- `__root.tsx` defines the root route.
- The `index` token represents index routes (configurable).
- The `route` token is used in `*.route.*` files (configurable).

## Path behavior

- Use `.` to express nesting in flat routes.
- Use `$param` for dynamic segments and `$` for splats.
- Prefix `_` for pathless layout routes.
- Suffix `_` to create non-nested routes under the root.
- Prefix `-` to exclude files from routing.
- Use `(group)` folders for grouping without URL changes.
- Use `[.]` to escape special characters like `.`.

## Use cases

- Encode nested routes using flat files
- Exclude helper files from routing
- Define pathless layouts for shared UI

## Notes

- `routeToken` and `indexToken` are configurable in file-based routing config.
- Avoid configuring tokens/prefixes that conflict with naming tokens.

## Examples

```txt
src/routes/
  __root.tsx
  index.tsx
  dashboard._layout.tsx
  dashboard.settings.tsx
  (marketing)/pricing.tsx
  -experimental.tsx
```

```txt
src/routes/
  blog.[.rss].tsx
```
