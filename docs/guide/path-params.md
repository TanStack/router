---
title: Path Params
---

Path params are used to match a single segment (the text until the next `/`) and provide its value back to you as a **named** variable. They are defined by using the `:` character in the path, followed by the key variable to assign it to. The following are valid path param paths:

- `:postId`
- `:name`
- `:teamId`
- `about/:name`
- `team/:teamId`
- `blog/:postId`

Because path param routes only match to the next `/`, child routes can be created to continue expressing hierarchy:

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

Up to this point, we've only talked about `path` matching, but the `path` is only a small party of the entire URL. In TanStack Router, the `search` section of the URL is actually a first-class citizen and represented as an object of key/value pairs. You can learn more about [Search Params]() in another section, but we'll mention here that you can use the `search` property to match a route using search params as well!

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

Routes in TanStack Router are extremely forgiving with plenty of default behaviors:

- If a route has **no path**, it is considered to have `path: *`, so it will always be matched
- If a route has **no element**, it is considered to have `element: <Outlet />` (or whatever you set as the `Router`'s `defaultElement` prop)

## Routes have so much more functionality, which we'll explore in the next few sections!
