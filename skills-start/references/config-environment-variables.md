---
name: Environment variables
description: Env loading, exposure rules, and validation.
version: 1
source: docs/start/framework/react/guide/environment-variables.md
---

# Environment variables

## Summary

- Start loads `.env` files with `.env.local` highest priority.
- Client access is limited to `VITE_`-prefixed variables.
- Server functions can access full `process.env`.

## Notes

- Provide typings in `src/env.d.ts`.
- Validate required env vars at runtime.
- `server.build.staticNodeEnv` controls NODE_ENV replacement.

## Use cases

- Configure secrets without client exposure
- Validate required env vars at startup
- Control production optimizations

## Notes

- Only `VITE_` vars are exposed to the client.
- Prefer `.env.local` for machine-specific values.

## Examples

```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
})

EnvSchema.parse(process.env)
```
