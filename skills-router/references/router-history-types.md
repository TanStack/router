---
name: History types
description: Browser, hash, and memory history options.
version: 1
source: docs/router/framework/react/guide/history-types.md
---

# History types

## Summary

- Default is browser history.
- Hash and memory history are supported and injectable.
- Useful for non-browser or testing environments.

## Use cases

- Use memory history for tests or SSR
- Use hash history for static hosting
- Customize navigation storage behavior

## Notes

- Pass a history instance via `createRouter({ history })`.
- Browser history is the default.

## Examples

```ts
import { createMemoryHistory } from '@tanstack/history'

const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
```
