---
name: Authentication overview
description: Auth patterns and security guidance for Start apps.
version: 1
source: docs/start/framework/react/guide/authentication-overview.md
---

# Authentication overview

## Summary

- Authentication and authorization are separate concerns.
- Prefer HTTP-only cookies or server-managed sessions.

## Patterns

- Protect routes via layout routes, components, or server function guards.
- Use server-driven auth state where possible.

## Security notes

- Use HTTPS, validate input, rate limit, and keep secrets server-only.

## Use cases

- Decide between hosted auth and DIY
- Plan session storage and route protection
- Apply security best practices

## Notes

- Prefer HTTP-only cookies over client storage.
- Auth is distinct from authorization.

## Examples

```ts
export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context }) => {
    if (!context.session?.user) throw redirect({ to: '/login' })
  },
})
```
