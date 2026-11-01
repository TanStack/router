---
id: create-route-property-order
title: Ensure correct order of inference sensitive properties for createRoute functions
---

For the following functions, the property order of the passed in object matters due to type inference:

- `createRoute`
- `createFileRoute`
- `createRootRoute`
- `createRootRouteWithContext`

The rule checks these functions when they are imported from a TanStack Router package (`@tanstack/react-router`, `@tanstack/solid-router`, `@tanstack/vue-router`), also under an alias (`import { createFileRoute as cfr }`) or through a namespace import (`Router.createFileRoute`). A local variable or parameter with the same name is not checked.

The correct property order is as follows

- `params`, `validateSearch`
- `loaderDeps`, `search.middlewares`, `ssr`
- `context`
- `beforeLoad`
- `loader`
- `onEnter`, `onStay`, `onLeave`, `head`, `scripts`, `headers`, `remountDeps`

All other properties are insensitive to the order as they do not depend on type inference.

The options object may be wrapped in `satisfies`, `as`, a `<T>` type assertion or a non-null `!`; the rule looks through the wrapper and the fix leaves it in place.

## Lifecycle object form

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

`context`, `beforeLoad` and `loader` also accept an object form, `{ handler, dehydrate, hydrate, ... }`. Inside that object the order matters as well: the parameters of `dehydrate`, `hydrate` and `revalidate` are inferred from `handler`, and the `data` parameter of `hydrate` is inferred from `dehydrate`. The rule checks and fixes this nested order too:

- `handler`
- `dehydrate`
- `hydrate`
- `revalidate` (`context` only), `staleReloadMode` (`loader` only)

A key a lifecycle does not accept (`revalidate` on `loader`, `staleReloadMode` on `context`) is not moved by this rule; the types reject it.

The lifecycle object may be wrapped in `satisfies`, `as`, a `<T>` type assertion or a non-null `!` as well; the rule looks through that wrapper too and the fix leaves it in place.

## When the order is reported but not fixed

The fix only reorders keys. In two cases it would change more than the order, so the rule reports the order and leaves the fix to you:

- A key would have to move across a spread (`...shared`) or a computed key (`[key]: value`). Both can set the same key, and in an object literal the later value wins: in `{ loader, ...shared }` a `loader` inside `shared` replaces yours, in `{ ...shared, loader }` yours replaces it. Moving the key past the spread would change which `loader` runs. A spread is never treated as a key, whatever its variable is called: `...loader` is a spread, not the `loader` key.
- A comment belongs to a key in the range the fix reorders, from the first to the last key whose position changes. A comment belongs to the key below it, also when it starts on the line where the key above ends; such a comment belongs to the key above as well. The fix moves the keys and leaves the text between them in place, so the comment would end up on a different key: a `// eslint-disable-next-line` or `// @ts-expect-error` comment would silence another line, and a `/* eslint-disable */` comment would cover other keys. Comments on keys before or after that range stay on their key, and comments inside a value, such as a function body, move with their key.

## Rule Details

Examples of **incorrect** code for this rule:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/path.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/path')({
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...getQueryOptions(context.hello),
      staleTime: 'static',
    })
  },
  beforeLoad: () => ({ hello: 'world' }),
})
```

<!-- ::end:tabs -->

# Solid

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/path.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/path')({
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...getQueryOptions(context.hello),
      staleTime: 'static',
    })
  },
  beforeLoad: () => ({ hello: 'world' }),
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

Examples of **correct** code for this rule:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/path.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/path')({
  beforeLoad: () => ({ hello: 'world' }),
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...getQueryOptions(context.hello),
      staleTime: 'static',
    })
  },
})
```

<!-- ::end:tabs -->

# Solid

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/path.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/path')({
  beforeLoad: () => ({ hello: 'world' }),
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...getQueryOptions(context.hello),
      staleTime: 'static',
    })
  },
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

Examples of **incorrect** code for the lifecycle object form:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    hydrate: ({ data }) => postCache.get(data.id),
    dehydrate: ({ data }) => ({ id: data.id }),
    handler: async ({ params }) => fetchPost(params.postId),
  },
})
```

<!-- ::end:tabs -->

# Solid

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    hydrate: ({ data }) => postCache.get(data.id),
    dehydrate: ({ data }) => ({ id: data.id }),
    handler: async ({ params }) => fetchPost(params.postId),
  },
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

Examples of **correct** code for the lifecycle object form:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.$postId.tsx"
/* eslint "@tanstack/router/create-route-property-order": "warn" */
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
/* eslint "@tanstack/router/create-route-property-order": "warn" */
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
- [x] 🔧 Fixable
