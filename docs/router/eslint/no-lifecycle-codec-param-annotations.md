---
id: no-lifecycle-codec-param-annotations
title: Disallow type annotations on the parameters of dehydrate, hydrate and revalidate
---

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

`context`, `beforeLoad` and `loader` accept an object form next to the plain function:

```tsx
loader: {
  handler: async ({ params }) => fetchPost(params.postId),
  dehydrate: ({ data }) => ({ id: data.id }),
  hydrate: ({ data, context }) => context.cache.get(data.id),
}
```

The parameters of `dehydrate`, `hydrate` and `revalidate` are inferred from the route:

- `dehydrate` receives the lifecycle context plus `data`, the awaited result of `handler`.
- `hydrate` receives the lifecycle context plus `data`: the awaited result of `dehydrate` when `dehydrate` is a function, otherwise the awaited result of `handler`.
- `revalidate` (on `context` only) receives the lifecycle context plus `prev`, the previous `context` result or `undefined`.

A type annotation written on one of these parameters is not checked against what the route produces. TypeScript trusts the annotation, so a wrong one hides a type error instead of reporting it: a `hydrate` annotated with a shape the server never sends compiles and fails at runtime. Leave these parameters unannotated. When inference reports an error, the fix is in `handler` or `dehydrate`, or in their order (`handler` before `dehydrate` before `hydrate`, see [create-route-property-order](./create-route-property-order.md)).

The rule inspects functions written inline as the `dehydrate`, `hydrate` or `revalidate` member of a lifecycle object in the options of `createRoute`, `createFileRoute`, `createRootRoute` and `createRootRouteWithContext`. These functions are recognized when they are imported from a TanStack Router package (`@tanstack/react-router`, `@tanstack/solid-router`, `@tanstack/vue-router`), also under an alias (`import { createFileRoute as cfr }`) or through a namespace import (`Router.createFileRoute`); a local variable or parameter with the same name is not checked. The rule does not report `handler` or return type annotations. The options object, the lifecycle object and the function may be wrapped in `satisfies`, `as`, a `<T>` type assertion or a non-null `!`, and a `this` pseudo-parameter (`function (this: void, ctx) {}`) is ignored: the parameter after it is the one checked. The rule has no autofix: remove the annotation by hand.

The rule only sees the parameters of functions written inline. It does not check a function passed by reference (`hydrate: restorePost`, with `restorePost` declared elsewhere) or one whose type comes from `satisfies` or `as` (`hydrate: (({ data }) => data) satisfies RestorePost`). TypeScript still checks such a `dehydrate`, a `revalidate`, and a `hydrate` next to a `dehydrate` function against the route. The exception is a `hydrate` next to `dehydrate: true`: the type that function declares for `data` is taken as is and not compared with what `handler` returns, so a wrong type compiles and fails at runtime, and the rule does not report it. Write `hydrate` inline and unannotated when `dehydrate` is `true`.

## Rule Details

Examples of **incorrect** code for this rule:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/no-lifecycle-codec-param-annotations": "error" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    handler: async ({ params }) => fetchPost(params.postId),
    dehydrate: ({ data }: { data: Post }) => ({ id: data.id }),
    hydrate: ({ data }: { data: { id: string } }) => postCache.get(data.id),
  },
})
```

<!-- ::end:tabs -->

# Solid

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/no-lifecycle-codec-param-annotations": "error" */
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    handler: async ({ params }) => fetchPost(params.postId),
    dehydrate: ({ data }: { data: Post }) => ({ id: data.id }),
    hydrate: ({ data }: { data: { id: string } }) => postCache.get(data.id),
  },
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

Examples of **correct** code for this rule:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/no-lifecycle-codec-param-annotations": "error" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    handler: async ({ params }) => fetchPost(params.postId),
    dehydrate: ({ data }) => ({ id: data.id }),
    hydrate: ({ data }) => postCache.get(data.id),
  },
})
```

<!-- ::end:tabs -->

# Solid

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/no-lifecycle-codec-param-annotations": "error" */
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    handler: async ({ params }) => fetchPost(params.postId),
    dehydrate: ({ data }) => ({ id: data.id }),
    hydrate: ({ data }) => postCache.get(data.id),
  },
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

## Attributes

- [x] ✅ Recommended
- [ ] 🔧 Fixable
