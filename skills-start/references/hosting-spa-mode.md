---
name: SPA mode
description: Shell rendering and SPA deployment.
version: 1
source: docs/start/framework/react/guide/spa-mode.md
---

# SPA mode

## Summary

- SPA mode renders a shell HTML and defers full render to client.
- Configure with `tanstackStart({ spa: { enabled: true } })`.
- Use `isShell()` to tailor shell rendering.

## Use cases

- Deploy on static hosts with SPA shell
- Avoid SSR while keeping server routes
- Customize shell-only UI

## Notes

- Configure redirects to the shell HTML.
- Allowlist server routes and functions.

## Examples

```ts
tanstackStart({
  spa: {
    enabled: true,
    maskPath: '/_shell',
  },
})
```
