---
name: ESLint rule - route property order
description: Enforce correct property order for route creation APIs.
version: 1
source: docs/router/eslint/create-route-property-order.md
---

# ESLint rule - route property order

## Summary

- The rule enforces property order for `createRoute`, `createFileRoute`,
  `createRootRoute`, and `createRootRouteWithContext`.
- The rule is recommended and auto-fixable.

## Order (high-level)

- Params and validation
- Loader dependencies and SSR flags
- Context
- Lifecycle hooks
- Loader
- Head, scripts, headers, remount dependencies

## Use cases

- Keep route definitions consistent across the codebase
- Reduce type errors from misordered properties
- Automate cleanup with auto-fix

## Notes

- The rule is recommended and auto-fixable.
- Applies to file-based and code-based route definitions.

## Examples

```ts
export const Route = createFileRoute('/posts')({
  validateSearch: z.object({ page: z.coerce.number().default(1) }),
  loader: async () => fetchPosts(),
  component: PostsPage,
  head: () => ({ title: 'Posts' }),
})
```
