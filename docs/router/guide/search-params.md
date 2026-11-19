---
title: Search Params
---

Similar to how TanStack Query made handling server-state in your React and Solid applications a breeze, TanStack Router aims to unlock the power of URL search params in your applications.

## Why not just use `URLSearchParams`?

We get it, you've been hearing a lot of "use the platform" lately and for the most part, we agree. However, we also believe it's important to recognize where the platform falls short for more advanced use-cases and we believe `URLSearchParams` is one of these circumstances.

Traditional Search Param APIs usually assume a few things:

- Search params are always strings
- They are _mostly_ flat
- Serializing and deserializing using `URLSearchParams` is good enough (Spoiler alert: it's not.)
- Search params modifications are tightly coupled with the URL's pathname and must be updated together, even if the pathname is not changing.

Reality is very different from these assumptions though.

- Search params represent application state, so inevitably, we will expect them to have the same DX associated with other state managers. This means having the capability of distinguishing between primitive value types and efficiently storing and manipulating complex data structures like nested arrays and objects.
- There are many ways to serialize and deserialize state with different tradeoffs. You should be able to choose the best one for your application or at the very least get a better default than `URLSearchParams`.
- Immutability & Structural Sharing. Every time you stringify and parse url search params, referential integrity and object identity is lost because each new parse creates a brand new data structure with a unique memory reference. If not properly managed over its lifetime, this constant serialization and parsing can result in unexpected and undesirable performance issues, especially in frameworks like React that choose to track reactivity via immutability or in Solid that normally relies on reconciliation to detect changes from deserialized data sources.
- Search params, while an important part of the URL, do frequently change independently of the URL's pathname. For example, a user may want to change the page number of a paginated list without touching the URL's pathname.

## Search Params, the "OG" State Manager

You've probably seen search params like `?page=3` or `?filter-name=tanner` in the URL. There is no question that this is truly **a form of global state** living inside of the URL. It's valuable to store specific pieces of state in the URL because:

- Users should be able to:
  - Cmd/Ctrl + Click to open a link in a new tab and reliably see the state they expected
  - Bookmark and share links from your application with others with assurances that they will see exactly the state as when the link was copied.
  - Refresh your app or navigate back and forth between pages without losing their state
- Developers should be able to easily:
  - Add, remove or modify state in the URL with the same great DX as other state managers
  - Easily validate search params coming from the URL in a format and type that is safe for their application to consume
  - Read and write to search params without having to worry about the underlying serialization format

## JSON-first Search Params

To achieve the above, the first step built in to TanStack Router is a powerful search param parser that automatically converts the search string of your URL to structured JSON. This means that you can store any JSON-serializable data structure in your search params and it will be parsed and serialized as JSON. This is a huge improvement over `URLSearchParams` which has limited support for array-like structures and nested data.

For example, navigating to the following route:

```tsx
const link = (
  <Link
    to="/shop"
    search={{
      pageIndex: 3,
      includeCategories: ['electronics', 'gifts'],
      sortBy: 'price',
      desc: true,
    }}
  />
)
```

Will result in the following URL:

```
/shop?pageIndex=3&includeCategories=%5B%22electronics%22%2C%22gifts%22%5D&sortBy=price&desc=true
```

When this URL is parsed, the search params will be accurately converted back to the following JSON:

```json
{
  "pageIndex": 3,
  "includeCategories": ["electronics", "gifts"],
  "sortBy": "price",
  "desc": true
}
```

If you noticed, there are a few things going on here:

- The first level of the search params is flat and string based, just like `URLSearchParams`.
- First level values that are not strings are accurately preserved as actual numbers and booleans.
- Nested data structures are automatically converted to URL-safe JSON strings

> 🧠 It's common for other tools to assume that search params are always flat and string-based which is why we've chosen to keep things URLSearchParam compliant at the first level. This ultimately means that even though TanStack Router is managing your nested search params as JSON, other tools will still be able to write to the URL and read first-level params normally.

## Validating and Typing Search Params

Despite TanStack Router being able to parse search params into reliable JSON, they ultimately still came from **a user-facing raw-text input**. Similar to other serialization boundaries, this means that before you consume search params, they should be validated into a format that your application can trust and rely on.

### Validating Search Params

TanStack Router provides convenient APIs for validating and typing search params via the `Route`'s `validateSearch` option. The validated, typed object is made available to this route's other options **and any child routes, too.**

`validateSearch` accepts any of:

- A plain function `(search) => T`
- An object with a `parse` method (`{ parse: (search) => T }`)
- A [Standard Schema](https://github.com/standard-schema/standard-schema) validator — including [Zod](https://zod.dev/) v4+, [Valibot](https://valibot.dev/) v1+, [ArkType](https://arktype.io/) v2+, and [Effect Schema](https://effect.website/docs/schema/introduction/)
- A `ValidatorAdapter` (used by `@tanstack/zod-adapter` for Zod v3)

It's usually best to provide sensible fallbacks for malformed or unexpected search params so your users' experience isn't interrupted.

Here's the simplest form — a hand-written validator:

```tsx title="src/routes/shop/products.tsx"
type ProductSearchSortOptions = 'newest' | 'oldest' | 'price'

type ProductSearch = {
  page: number
  filter: string
  sort: ProductSearchSortOptions
}

export const Route = createFileRoute('/shop/products')({
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    return {
      page: Number(search?.page ?? 1),
      filter: (search.filter as string) || '',
      sort: (search.sort as ProductSearchSortOptions) || 'newest',
    }
  },
})
```

If `validateSearch` throws, the route's `onError` option will be triggered (with `error.routerCode === 'VALIDATE_SEARCH'`) and the `errorComponent` will render instead of the route's `component`.

### Validating with a schema library

Any library that implements [Standard Schema](https://github.com/standard-schema/standard-schema) can be passed directly to `validateSearch` — no adapter required. Both the input type (used when navigating) and output type (used when reading search params) are inferred for you.

#### Zod

For Zod v4 and later, pass the schema directly:

```tsx title="src/routes/shop/products.tsx"
import { z } from 'zod'

const productSearchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().catch(''),
  sort: z.enum(['newest', 'oldest', 'price']).catch('newest'),
})

export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})
```

`.catch()` swaps in a fallback value instead of throwing when validation fails — appropriate when you'd rather absorb a malformed param than interrupt the user with an error screen. Use `.default()` instead if you want the route's `errorComponent` to render on bad input.

When your schema uses `.default(...)` to fill in missing values, navigation and reading get the right types automatically:

```tsx
const productSearchSchema = z.object({
  page: z.number().default(1),
  filter: z.string().default(''),
  sort: z.enum(['newest', 'oldest', 'price']).default('newest'),
})

// page/filter/sort are optional when navigating (defaults fill in)…
<Link to="/shop/products" />

// …and guaranteed present when reading.
const { page, filter, sort } = Route.useSearch()
```

##### Zod v3

If you're still on Zod v3, install `@tanstack/zod-adapter` and wrap the schema with `zodValidator`. The adapter exists because Zod v3 schemas don't implement Standard Schema:

```tsx
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const productSearchSchema = z.object({
  page: z.number().default(1),
  filter: z.string().default(''),
  sort: z.enum(['newest', 'oldest', 'price']).default('newest'),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: zodValidator(productSearchSchema),
})
```

In Zod v3, `.catch()` widens the type to `unknown`. The adapter package ships a `fallback` helper that preserves types while providing a fallback value:

```tsx
import { fallback, zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const productSearchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  filter: fallback(z.string(), '').default(''),
  sort: fallback(z.enum(['newest', 'oldest', 'price']), 'newest').default(
    'newest',
  ),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: zodValidator(productSearchSchema),
})
```

`zodValidator` also accepts an options object if you need to swap the `input` / `output` inference (rare, usually only when the `output` type is more accurate than the `input`):

```tsx
validateSearch: zodValidator({
  schema: productSearchSchema,
  input: 'output',
  output: 'input',
})
```

#### Valibot

[Valibot](https://valibot.dev/) v1+ implements Standard Schema, so the schema can be used directly:

```tsx
import * as v from 'valibot'

const productSearchSchema = v.object({
  page: v.optional(v.fallback(v.number(), 1), 1),
  filter: v.optional(v.fallback(v.string(), ''), ''),
  sort: v.optional(
    v.fallback(v.picklist(['newest', 'oldest', 'price']), 'newest'),
    'newest',
  ),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

#### ArkType

[ArkType](https://arktype.io/) v2+ implements Standard Schema, so the schema can be used directly:

```tsx
import { type } from 'arktype'

const productSearchSchema = type({
  page: 'number = 1',
  filter: 'string = ""',
  sort: '"newest" | "oldest" | "price" = "newest"',
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

#### Effect Schema

[Effect Schema](https://effect.website/docs/schema/introduction/) implements [Standard Schema](https://effect.website/docs/schema/standard-schema/) natively:

```tsx
import { Schema as S } from 'effect'

const productSearchSchema = S.Struct({
  page: S.optionalWith(S.NumberFromString, { default: () => 1 }),
  filter: S.optionalWith(S.String, { default: () => '' }),
  sort: S.optionalWith(S.Literal('newest', 'oldest', 'price'), {
    default: () => 'newest' as const,
  }),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

### Strict mode for unknown search params

By default, search keys that aren't returned by any route's `validateSearch` are passed through unchanged. To strip unknown keys on every navigation, set `search.strict` to `true` on the router:

```tsx
const router = createRouter({
  routeTree,
  search: {
    strict: true,
  },
})
```

With `strict: true`, only keys produced by a `validateSearch` (anywhere in the matched route tree) are kept in the URL.

## Reading Search Params

Once your search params have been validated and typed, you're finally ready to start reading and writing to them. There are a few ways to do this in TanStack Router, so let's check them out.

### Using Search Params in Loaders

Please read the [Search Params in Loaders](./data-loading.md#using-loaderdeps-to-access-search-params) section for more information about how to read search params in loaders with the `loaderDeps` option.

### Search Params are inherited from Parent Routes

The search parameters and types of parents are merged as you go down the route tree, so child routes also have access to their parent's search params:

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/shop/products.tsx"
const productSearchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().catch(''),
  sort: z.enum(['newest', 'oldest', 'price']).catch('newest'),
})

type ProductSearch = z.infer<typeof productSearchSchema>

export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})
```

```tsx title="src/routes/shop/products/$productId.tsx"
export const Route = createFileRoute('/shop/products/$productId')({
  beforeLoad: ({ search }) => {
    search
    // ^? ProductSearch ✅
  },
})
```

<!-- ::end:tabs -->

### Search Params in Components

You can access your route's validated search params in your route's `component` via the `useSearch` hook.

```tsx title="src/routes/shop/products.tsx"
export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})

const ProductList = () => {
  const { page, filter, sort } = Route.useSearch()

  return <div>...</div>
}
```

> [!TIP]
> If your component is code-split, you can use the [getRouteApi function](./code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `Route` configuration to get access to the typed `useSearch()` hook.

`useSearch` also accepts `select`, `structuralSharing`, and `shouldThrow` options. Use `select` to read a slice of the search object so the component only re-renders when that slice changes:

```tsx
const page = Route.useSearch({ select: (s) => s.page })
```

See [Render Optimizations](./render-optimizations.md) for when to enable `structuralSharing`.

### Search Params outside of Route Components

You can access your route's validated search params anywhere in your app using the `useSearch` hook. By passing the `from` id/path of your origin route, you'll get even better type safety:

```tsx
// src/routes/shop.products.tsx
export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
  // ...
})

// Somewhere else...

// src/components/product-list-sidebar.tsx
const routeApi = getRouteApi('/shop/products')

const ProductList = () => {
  const routeSearch = routeApi.useSearch()

  // OR

  const { page, filter, sort } = useSearch({
    from: Route.fullPath,
  })

  return <div>...</div>
}
```

Or, you can loosen up the type-safety and get an optional `search` object by passing `strict: false`:

```tsx
function ProductList() {
  const search = useSearch({
    strict: false,
  })
  // {
  //   page: number | undefined
  //   filter: string | undefined
  //   sort: 'newest' | 'oldest' | 'price' | undefined
  // }

  return <div>...</div>
}
```

## Writing Search Params

Now that you've learned how to read your route's search params, you'll be happy to know that you've already seen the primary APIs to modify and update them. Let's remind ourselves a bit

### `<Link search />`

The best way to update search params is to use the `search` prop on the `<Link />` component.

If the search for the current page shall be updated and the `from` prop is specified, the `to` prop can be omitted.
Here's an example:

```tsx title="src/routes/shop/products.tsx"
export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})

const ProductList = () => {
  return (
    <div>
      <Link from={Route.fullPath} search={(prev) => ({ page: prev.page + 1 })}>
        Next Page
      </Link>
    </div>
  )
}
```

If you want to update the search params in a generic component that is rendered on multiple routes, specifying `from` can be challenging.

In this scenario you can set `to="."` which will give you access to loosely typed search params.
Here is an example that illustrates this:

```tsx
// `page` is a search param that is defined in the __root route and hence available on all routes.
const PageSelector = () => {
  return (
    <div>
      <Link to="." search={(prev) => ({ ...prev, page: prev.page + 1 })}>
        Next Page
      </Link>
    </div>
  )
}
```

If the generic component is only rendered in a specific subtree of the route tree, you can specify that subtree using `from`. Here you can omit `to='.'` if you want.

```tsx
// `page` is a search param that is defined in the /posts route and hence available on all of its child routes.
const PageSelector = () => {
  return (
    <div>
      <Link
        from="/posts"
        to="."
        search={(prev) => ({ ...prev, page: prev.page + 1 })}
      >
        Next Page
      </Link>
    </div>
  )
```

### `useNavigate(), navigate({ search })`

The `navigate` function also accepts a `search` option that works the same way as the `search` prop on `<Link />`:

```tsx title="src/routes/shop/products.tsx"
export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: productSearchSchema,
})

const ProductList = () => {
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div>
      <button
        onClick={() => {
          navigate({
            search: (prev) => ({ page: prev.page + 1 }),
          })
        }}
      >
        Next Page
      </button>
    </div>
  )
}
```

### `router.navigate({ search })`

The `router.navigate` function works exactly the same way as the `useNavigate`/`navigate` hook/function above.

### `<Navigate search />`

The `<Navigate search />` component works exactly the same way as the `useNavigate`/`navigate` hook/function above, but accepts its options as props instead of a function argument.

## Transforming search with search middlewares

When link hrefs are built, by default the only thing that matters for the query string part is the `search` property of a `<Link>`.

TanStack Router provides a way to manipulate search params before the href is generated via **search middlewares**.
Search middlewares are functions that transform the search parameters when generating new links for a route or its descendants.
They are also executed upon navigation after search validation to allow manipulation of the query string.

The following example shows how to make sure that for **every** link that is being built, the `rootValue` search param is added _if_ it is part of the current search params. If a link specifies `rootValue` inside `search`, then that value is used for building the link.

```tsx
import { z } from 'zod'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: searchSchema,
  search: {
    middlewares: [
      ({ search, next }) => {
        const result = next(search)
        return {
          rootValue: search.rootValue,
          ...result,
        }
      },
    ],
  },
})
```

Since this specific use case is quite common, TanStack Router provides a generic implementation to retain search params via `retainSearchParams`:

<!-- ::start:framework -->

# React

```tsx
import { z } from 'zod'
import { createRootRoute, retainSearchParams } from '@tanstack/react-router'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: searchSchema,
  search: {
    middlewares: [retainSearchParams(['rootValue'])],
  },
})
```

# Solid

```tsx
import { z } from 'zod'
import { createRootRoute, retainSearchParams } from '@tanstack/solid-router'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: searchSchema,
  search: {
    middlewares: [retainSearchParams(['rootValue'])],
  },
})
```

<!-- ::end:framework -->

Pass `true` instead of a key list to retain **every** current search param across navigations:

```tsx
search: {
  middlewares: [retainSearchParams(true)],
}
```

Another common use case is to strip out search params from links if their default value is set. TanStack Router provides a generic implementation for this use case via `stripSearchParams`:

<!-- ::start:framework -->

# React

```tsx
import { z } from 'zod'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

const defaultValues = {
  one: 'abc',
  two: 'xyz',
}

const searchSchema = z.object({
  one: z.string().default(defaultValues.one),
  two: z.string().default(defaultValues.two),
})

export const Route = createFileRoute('/hello')({
  validateSearch: searchSchema,
  search: {
    // strip default values
    middlewares: [stripSearchParams(defaultValues)],
  },
})
```

# Solid

```tsx
import { z } from 'zod'
import { createFileRoute, stripSearchParams } from '@tanstack/solid-router'

const defaultValues = {
  one: 'abc',
  two: 'xyz',
}

const searchSchema = z.object({
  one: z.string().default(defaultValues.one),
  two: z.string().default(defaultValues.two),
})

export const Route = createFileRoute('/hello')({
  validateSearch: searchSchema,
  search: {
    // strip default values
    middlewares: [stripSearchParams(defaultValues)],
  },
})
```

<!-- ::end:framework -->

`stripSearchParams` accepts three forms:

- An **object of defaults** — strips a key when its current value deeply equals the default (shown above).
- An **array of keys** — always strips those optional keys, regardless of value: `stripSearchParams(['debug', 'tracking'])`.
- `true` — strips all search params. Only allowed when the route's schema has no required keys.

Multiple middlewares can be chained. The following example shows how to combine both `retainSearchParams` and `stripSearchParams`.

<!-- ::start:framework -->

# React

```tsx
import {
  Link,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import { z } from 'zod'

const defaultValues = ['foo', 'bar']

export const Route = createFileRoute('/search')({
  validateSearch: z.object({
    retainMe: z.string().optional(),
    arrayWithDefaults: z.string().array().default(defaultValues),
    required: z.string(),
  }),
  search: {
    middlewares: [
      retainSearchParams(['retainMe']),
      stripSearchParams({ arrayWithDefaults: defaultValues }),
    ],
  },
})
```

# Solid

```tsx
import {
  Link,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import { z } from 'zod'

const defaultValues = ['foo', 'bar']

export const Route = createFileRoute('/search')({
  validateSearch: z.object({
    retainMe: z.string().optional(),
    arrayWithDefaults: z.string().array().default(defaultValues),
    required: z.string(),
  }),
  search: {
    middlewares: [
      retainSearchParams(['retainMe']),
      stripSearchParams({ arrayWithDefaults: defaultValues }),
    ],
  },
})
```

<!-- ::end:framework -->
