---
title: Search Params
---

Similar to how TanStack Query made handling server-state in your React applications a breeze, TanStack Router aims to unlock the power of URL search params in your applications.

## Search Params, the "OG" State Manager

Most applications, even large ones will get away with requiring only a few string-based search query params in the URL, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is that while **it may not fit the hierarchical patterns of the pathname** section of the URL, it's still very important to the output of a page.

Both the ability to consume search params and manipulate them without restriction is paramount to your app's developer and user experience. After all, we're talking about the original and very unique flavor of **global state management**, here. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

## Why not just use `window.location.search` and URLSearchParams?

We get it, you've been hearing a lot of "use the platform" lately and for the most part, we agree. However, we also believe it's important to recognize where the platform falls short and `URLSearchParams` is one of these circumstances.

Most other search param APIs like to assume a few things:

- Search params are always strings
- They are _mostly_ flat
- There will probably only be a few of them at once
- Serializing and deserializing using `URLSearchParams` is good enough (Spoiler alert: it's not, it sucks)

Reality is very different from these assumptions though.

- Search params are "state", whether you like it or not, and the most common way to store state is as JSON. This is especially true when you're dealing with complex data structures like arrays and objects.
- State is often nested and hierarchical and your search params should be able to handle this.
- State tends to grow with your application and you will inevitably have more than a few search params at once.
- There are many ways to serialize and deserialize state with different tradeoffs. You should be able to choose the best one for your application or at the very least get a better default than `URLSearchParams`.
- Immutability & Structural Sharing. Every time you stringify and parse, referential integrity and object identity is lost because each new parse creates a brand new structure, totally unique from the last. If not properly managed, this can result in unnecessary re-renders and massive performance issues, especially in frameworks like React that choose to track reactivity via immutability.

## JSON-first Search Params

Built in to TanStack Router is a powerful search param parser that automatically converts the search string of your URL to structured JSON. This means that you can store any JSON-serializable data structure in your search params and it will be parsed and serialized as JSON. This is a huge improvement over `URLSearchParams` which has limited support for array-like structures and nested data.

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

##

## Validating and Typing Search Param JSON

Despite TanStack Router being able to parse search params into reliable JSON, they ultimately still came from **a user-facing string input**. Similar to other free-entry serialization bounderies, this means that before you consume search params, they should be validated into a format that your application can trust and rely on.

### Enter Validation + TypeScript!

To solve this issue, TanStack Router provides convenient APIs for validating and typing search params. This all starts with the `Route`'s `validateSearch` option:

```tsx
interface ProductSearch {
  page: number
  filter: string
  sort: 'newest' | 'oldest' | 'price'
}

const allProductsRoute = new Route({
  getParentRoute: () => shopRoute,
  path: 'products',
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    // validate and parse the search params into a typed state
    return {
      page: Number(search?.page ?? 1),
      filter: search.filter || '',
      sort: search.sort || 'newest',
    }
  },
})
```

In the above example, we're validating the search params of the `allProductsRoute` and returning a typed `ProductSearch` object. This typed object is then made available to this route's other options and any child routes, too!

### Validating Search Params

The `validateSearch` option is a function that takes in the raw search params as a `Record<string, unknown>` and returns a typed object. If this function throws an error, the route's `onLoadError` callback will be triggered and the `errorComponent` will be rendered instead of the route's `component` where you can handle the search param error however you'd like. Here's an example:

```tsx
const allProductsRoute = new Route({
  getParentRoute: () => shopRoute,
  path: 'products',
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    // validate and parse the search params into a typed state
    return {
      page: Number(search?.page ?? 1),
      filter: search.filter || '',
      sort: search.sort || 'newest',
    }
  },
  onLoadError: (error: Error) => {
    // handle the error however you'd like
    console.error(error)

    // rethrow the error to trigger the error component
    throw error
  },
  errorComponent: () => <div>Invalid search params!</div>,
})
```

## A Unified Search Param API

To solve all of the above problems, TanStack Router provides a unified search param API that is:

-

- Low-level declarative APIs to manipulate query state (think `<Link>`, `<Navigate>` and `useNavigate`). This is one where most routers can't or won't go. To do this correctly, you have to buy into your search-param APIs wholesale at the core of the architecture and provide them as a consistent experience through the entire library.

Let's just say TanStack Router doesn't skimp on search params. It handles all of this out of the box and goes the extra mile!

TODO
