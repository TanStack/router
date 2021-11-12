---
id: simple-cache
title: React Location Simple Cache
---

A simple cache created for React Location route loaders.

- Fetch Policies
- Stale-While-Revalidate
- Custom Keys
- Manual Invalidation

## Installation

```bash
yarn add react-location-simple-cache
# or
npm i react-location-simple-cache
```

## Getting Started

```tsx
import { ReactLocation, Router } from 'react-location'
import { ReactLocationSimpleCache } from 'react-location-simple-cache'

//

const routeCache = new ReactLocationSimpleCache()
const location = new ReactLocation()

function App() {
  return (
    <Router
      location={location}
      routes={[
        {
          path: '/',
          element: <Posts />,
          loader: routeCache.createLoader(async () => ({
            posts: await fetchPosts(),
          })),
        },
      ]}
    />
  )
}
```

## Docs

### ReactLocationSimpleCache

Use the `ReactLocationSimpleCache` class to create a new cache instance.

```tsx
const simpleCache = new ReactLocationSimpleCache()
```

### SimpleCacheRecord

This is the underlying shape of each record that is stored in the cache

```tsx
import { LoaderData, RouteMatch } from 'react-location'

export type SimpleCacheRecord<
  TData extends LoaderData = Record<string, unknown>
> = {
  key: string
  updatedAt: number
  ready: boolean
  promise?: Promise<TData>
  data?: any
  invalid?: boolean
  match: RouteMatch
}
```

### Fetch Policies

The caching functionality of the simple cache allows for a few different fetch policies to be used when determining if and when your loader function is called again.

```tsx
type FetchPolicy = 'cache-and-network' | 'cache-first' | 'network-only'
```

- `cache-and-network`
  - If the record is empty:
    - navigation **suspends** while the data is fetch and cached
  - If data is cached:
    - Navigation is immediate
    - If a `maxAge` **was not supplied**:
      - The data is always refetched in the background after navigation
    - If a `maxAge` **was supplied OR the record has been manually invalidated**:
      - If the record has expired, the data is refetched in the background after navigation
- `cache-first`
  - If the record is empty:
    - navigation **suspends** while the data is fetch and cached
  - If data is cached:
    - Navigation is immediate
    - If the record has been manually marked as `invalid`, it will be refetch in the background
    - Otherwise, the data is never refetched
- `network-only`
  - navigation **always suspends** while the data is fetched and cached

### `cache.createLoader`

This cache method creates a loader function for a React Location route.

```tsx
createLoader: (
  loader: Loader,
  opts?: {
    key?: (match: RouteMatch) => string
    maxAge?: number
    policy?: FetchPolicy
  }
) => Loader
```

| Property | Description                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loader   | The loader function you would normally pass to your router loader property                                                                                                              |
| key      | An optional function that receives the RouteMatch object and returns a unique string used to identify the underlying record for this route. The full route pathname is used by defualt. |
| maxAge   | If using the `An optional integer of milliseconds to use as the threshold of time before the underlying data will be fetched again.                                                     |
| policy   | The [`FetchPolicy`](#fetch-policies) to be used for this loader                                                                                                                         |

```tsx
const routes = [
  {
    path: ':postId',
    element: <Post />,
    loader: routeCache.createLoader(
      async ({ params: { postId } }) => ({
        post: await fetchPostById(postId),
      }),
      {
        key: (match) => `posts_${match.params.postId}`,
      }
    ),
  },
]
```

### `cache.clearAll`

Resets the cache to its original state with no records and no data

```tsx
type cache = {
  removeAll(): void
}
```

### `cache.clear`

Removes records from the cache by predicate function

```tsx
type cache = {
  remove<TLoaderData>(
    predicateFn: (record: SimpleCacheRecord) => boolean | any
  ): void
}
```

### `cache.filter`

Returns records by predicate function

```tsx
type cache = {
  filter<TLoaderData>(
    predicateFn: (record: SimpleCacheRecord) => boolean | any
  ): SimpleCacheRecord<TLoaderData>
}
```

### `cache.find`

Returns the first record found by predicate

```tsx
type cache = {
  find<TLoaderData>(
    predicateFn: (record: SimpleCacheRecord) => boolean | any
  ): SimpleCacheRecord<TLoaderData>
}
```

### `cache.invalidate`

Invalidates records by predicate function

```tsx
type cache = {
  invalidate<TLoaderData>(
    predicateFn: (record: SimpleCacheRecord) => boolean | any
  ): void
}
```
