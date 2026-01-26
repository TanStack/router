---
name: Execution model
description: Server, client, and isomorphic execution behavior in Start.
version: 1
source: docs/start/framework/react/guide/execution-model.md
---

# Execution model

## Summary

- Start is isomorphic by default; loaders run on server and client.
- Environments: server (SSR, API, build) and client (browser).

## APIs

- `createServerFn` and `createServerOnlyFn` for server-only logic.
- `createClientOnlyFn` and `ClientOnly` for client-only logic.
- `createIsomorphicFn` for env-specific implementations.
- `useHydrated` to detect hydration state.

## Security notes

- Keep secrets server-only; avoid exposing in loaders.
- Only `VITE_`-prefixed vars are exposed to the client.

## Use cases

- Choose server/client/isomorphic execution paths
- Keep secrets server-side
- Control hydration-dependent UI

## Notes

- Loaders run on both server and client by default.
- `ClientOnly` helps prevent hydration mismatch.

## Examples

```ts
const serverOnly = createServerOnlyFn(() => process.env.SECRET_KEY)
```
