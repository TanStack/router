---
title: Routes
---

## What is a route?

A React Location route is just an **object**. The `path` defines the path of the route it should match. Every property of the `Route` type is optional but clearly recommended for varying circumstances. Here's the simplest use-case for path matching!

```tsx
const routes = [
  {
    path: 'about',
  },
]
```

## Routes Paths

A route path can be a string _(regular expression support is coming soon!)_, and does not require a leading or trailing slash. The following are valid paths:

- `/`
- `/about`
- `about/`
- `about`
- `About`

> **Important:** Route paths are **not case-sensitive** by default. This means that `/about` and `/About` are considered the same path. This is a good thing, since this is the way most of the web works anyway! However, if you truly want to match a path with a different case, you can set a route's `caseSensitive` property to `true`.

**Leading and trailing slashes are optional because they do not affect the hierarchy of the route structure.** To build hierarchy, you can use slashes inside of your route path:

- `about/me`
- `about/me/`
- `about/me/you`
- `about/me/you/`

Or, you can use the `children` property to define child routes:

```tsx
const routes = [
  {
    path: 'about',
    children: [
      {
        path: 'me', // matches /about/me
      },
      {
        path: 'you', // matches /about/you
      },
    ],
  },
]
```

## The Root/Index Path vs Normal Paths

A route with a path of `/` is considered the root or index route, which is special because it is considered an **exact** match. For example:

Given a location of `/teams`, the `/` route would match:

```tsx
const routes = [
  {
    path: 'teams',
    children: [
      {
        path: '/', // matches /teams root/index
      },
    ],
  },
]
```

However, given a location of `/teams/1234`, the `/` would NOT match:

```tsx
const routes = [
  {
    path: 'teams',
    children: [
      {
        path: '/', // matches /teams root/index
      },
      {
        path: ':teamId', // matches /teams/:teamId
      },
    ],
  },
]
```

All other route path types that are not root/index (`/`) routes are **fuzzy** matched. This means that if they are either an exact match OR are a prefix of the current location, they will match. For example:

```tsx
const routes = [
  {
    path: 'dashboard',
    children: [
      {
        path: '/', // matches /dashboard exactly
      },
      {
        path: 'teams', // matches /dashboard/teams/* (notice the fuzzy match)
      },
      {
        path: 'users', // matches /dashboard/users/*
      },
    ],
  },
]
```

## Path Params

Path params are named **wildcards** that can be used to match, and extract, any part of the path that they match. They can be defined by using the `:` character in the path. The following are valid paths:

- `:postId`
- `:name`
- `:teamId`
- `about/:name`
- `team/:teamId`
- `blog/:postId`

Again, the `children` property can be used to express nested routes with path params:

```tsx
const routes = [
  {
    path: 'about',
    children: [
      {
        path: ':name', // matches /about/:name
      },
    ],
  },
]
```

**The text that matches a path param is extracted and usable in many places like [loaders](../route-loaders), [importers](../route-imports) and [elements](../route-matches).**

Because path params behave like wildcards, they will match any path that provides them with a valid value. Because of this, it is recommended to define path params last in your route hierarchy so you have the opportunity to match other non-wildcard paths before they are matched by path params:

```tsx
const routes = [
  {
    path: 'teams',
    children: [
      {
        path: 'new', // matches /teams/new
      },
      {
        path: ':teamId', // matches /teams/:teamId
      },
    ],
  },
]
```

## Wildcard Paths

Wildcard paths are defined by using the `*` character in the path. The following are valid paths:

- `*`
- `about/*`
- `team/*`
- `blog/*`

Again, the `children` property can be used to express nested routes with wildcard paths:

```tsx
const routes = [
  {
    path: 'dashboard',
    children: [
      {
        path: '/', // matches /dashboard exactly
      },
      {
        path: 'teams', // matches /dashboard/teams/*
      },
      {
        path: '*', // matches /dashboard/*
      },
    ],
  },
]
```

**The text that matches a wildcard is extracted under the `*` key and is usable in many places like [loaders](), [importers]() and [elements, via `useMatch`]().**

## Search Matching

Up to this point, we've only talked about `path` matching, but the `path` is only a small party of the entire URL. In React Location, the `search` section of the URL is actually a first-class citizen and represented as an object of key/value pairs. You can learn more about [Search Params]() in another section, but we'll mention here that you can use the `search` property to match a route using search params as well!

To do this, pass a `search` function to the route:

```tsx
const routes = [
  {
    path: 'team',
    // This route would match the url `/team?teamId=1234`
    search: (search) => {
      return search.teamId === '1234'
    },
  },
]
```

The `search` function is passed the current `search` object, and should return a boolean value. If the function returns `true`, the route will match.

Note that if you have two base routes that are only differentiated by search, you must supply a unique `id` to each route object.

```tsx
const routes = [
  {
    id: 'teamId1234',
    path: 'team',
    // This route would match the url `/team?teamId=1234`
    search: (search) => {
      return search.teamId === '1234'
    },
  },
  {
    id: 'teamId9999',
    path: 'team',
    // This route would match the url `/team?teamId=9999`
    search: (search) => {
      return search.teamId === '9999'
    },
  },
]
```

> Even we are still exploring the possibilities that `search` matching provides, so let us know what you do with them!

## Route Defaults

Routes in React Location are extremely forgiving with plenty of default behaviors:

- If a route has **no path**, it is considered to have `path: *`, so it will always be matched
- If a route has **no element**, it is considered to have `element: <Outlet />` (or whatever you set as the `Router`'s `defaultElement` prop)

## Routes have so much more functionality, which we'll explore in the next few sections!
