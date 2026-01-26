---
name: Hosting platforms
description: Deployment targets and hosting patterns for Start.
version: 1
source: docs/start/framework/react/guide/hosting.md
---

# Hosting platforms

## Summary

- Start can deploy to Cloudflare, Netlify, Railway, Node, Bun, and more.
- Vite builds and Nitro adapters drive most deployment targets.

## Notes

- Cloudflare uses `@cloudflare/vite-plugin` and Wrangler.
- Netlify uses `@netlify/vite-plugin-tanstack-start`.
- Railway and other targets commonly use Nitro presets.

## Use cases

- Deploy to Cloudflare or Netlify
- Run on Node or Bun
- Choose a Nitro preset for your platform

## Notes

- Ensure platform-specific adapters are installed.
- Use `.output/server/index.mjs` for Node targets.

## Examples

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/start/vite'

export default {
  plugins: [tanstackStart()],
}
```
