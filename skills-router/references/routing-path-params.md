---
name: Path params
description: Dynamic segments, splats, and optional params.
version: 1
source: docs/router/framework/react/guide/path-params.md
---

# Path params

## Summary

- Dynamic segments use `$param` in the path.
- Splat segments use `$` and map to `_splat`.
- Optional params use `{-$param}` and can combine with prefix/suffix.

## Usage

- Access via `Route.useParams`, `useParams`, or loader `params`.
- Navigate with `params` objects or updater functions.

## Use cases

- Model resource IDs in URLs
- Support optional segments
- Capture multi-segment splats

## Notes

- Optional params can include prefixes and suffixes.
- Use `pathParamsAllowedCharacters` to allow specific URI chars.

## Examples

```tsx
// src/routes/users.$userId.tsx
export const Route = createFileRoute('/users/$userId')({
  component: UserDetail,
})

function UserDetail() {
  const { userId } = Route.useParams()
  return <div>User {userId}</div>
}
```

```tsx
// optional param
export const Route = createFileRoute('/posts/{-$slug}')({
  component: Posts,
})
```
