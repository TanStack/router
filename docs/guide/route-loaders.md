---
title: Route Loaders
---

Route loaders are route-level functions that can specify arbitrary data requirements for that route. They can be used to:

- Fetch data from a server
- Delay the loading of a route until an asynchronous action has been completed
- Prepare the route to be rendered

## Why should I use route loaders? Why are they cool?!

Routes requiring data are nothing new, but the way TanStack Router orchestrates these requirements is where the magic happens. In a traditional React application, usually, the route is rendered immediately, and the data is fetched asynchronously either via a custom hook or a suspense boundary that is hit. This is a great way to get data from a server, but it also means that the route is rendered before the data is available. It introduces the need for a lot of boilerplate code to handle the asynchronous data fetching and even worse, **spinners** everywhere. This is usually a sub-optimal user experience, and with route loaders, **it's one that we can avoid!**

Route loaders are called when:

- A route is matched for navigation
- A route is matched for preloading

## Route Loader Promises

Route loaders are extremely agnostic as to how you fetch your data. You can use any data fetching means that you like! Here are some of our favorites:

- `fetch`
- `axios`
- React Query
- GraphQL-Request
- Relay
- RTK Query

All you have to do is return a promise that resolves **an object with the data you want to be available at the route**.

## Route Loader Objects

Why do route loaders need to return an object? Because **multiple route loaders can be matched at once**. For example:

- A `teams` route might have a route loader that fetches a list of teams
- A `teams/:teamId` route might have another loader that fetches the individual team details.

At the `teams` route, you would return an object with the `teams` key, and at the `teams/:teamId` route, you would return an object with the `team` key.

```tsx
const routes = [
  {
    path: 'teams',
    loader: async () => ({
      teams: await fetch('/api/teams'),
    }),
    children: [
      {
        path: ':teamId',
        loader: async ({ params: { teamId } }) => ({
          team: await fetch(`/api/teams/${teamId}`),
        }),
      },
    ],
  },
]
```

Each of these loader objects will be merged together into a single object that can be consumed in your routes or sub-loaders:

```json
{
  "teams": [...],
  "team": {...}
}
```

## Parallelized Execution Vs Serial Execution

Route loaders are parallelized by default. This means that when a route is matched, each of the loaders it matches will be executed **at the same** time. This is great for performance, but it also means that if one of the loaders fails, the others will still be executed. It also means that if one of your loaders depends on the data of a parent, it will need to de-opt and await the promise of its parent before proceeding.

Here is an example of a route loader that depends on the data of a parent:

```tsx
const routes = [
  {
    path: 'teams',
    loader: async () => ({
      teams: await fetch('/api/teams'),
    }),
    children: [
      {
        path: ':teamId',
        loader: async ({ params: { teamId } }, { parentMatch }) => ({
          // This route will wait for the parent loaderPromise to resolve before finding the individual team
          team: await parentMatch.loaderPromise.then(({ teams }) =>
            teams.find((team) => team.id === teamId),
          ),
        }),
      },
    ],
  },
]
```

## Using loader data in Routes with the `useMatch` hook

Loader data is made available to elements via the `useMatch` hook. Calling `useMatch` in an element will return the closest match to the component you call it from:

```tsx
const routes = [
  {
    path: 'teams',
    element: <Teams />,
    loader: async () => ({
      teams: await fetch('/api/teams'),
    }),
    children: [
      {
        path: ':teamId',
        element: <Team />,
        loader: async ({ params: { teamId }, parentMatch }) => ({
          // This route will wait for the parent loaderPromise to resolve before finding the individual team
          team: await parentMatch.loaderPromise.then(({ teams }) =>
            teams.find((team) => team.id === teamId),
          ),
        }),
      },
    ],
  },
]

function Teams() {
  const {
    data: { teams },
  } = useMatch()
}

function Team() {
  const {
    data: { team },
  } = useMatch()
}
```

## Route Loader Caching

> The built-in caching mechanisms for TanStack Router are extremely basic on purpose since **caching is not the core responsibility or purpose of TanStack Router**. That said, it ensures a very good UX out of the box by doing the bare minimum to retain navigational consistency.

By default, route loaders are called for **new or changed routes in the route hierarchy that resulted from a navigation**.

Given the following navigational hierarchy, the bolded routes will have their route loaders called:

1. **/dashboard**
1. /dashboard, **/accounts**
1. /dashboard, /accounts, **/customers** **/123**
1. /dashboard, /accounts, /customers **/456**
1. /dashboard, /accounts, /dashboard
1. /dashboard, /accounts
1. /dashboard

As you might have noticed, only the **new or changed** route loaders were called during navigation and not the **old** ones. This is because route loader results are cached if they do not change from navigation to navigation.

Even as the session navigated back up to `/dashboard`, each of the parent route loaders were not called again, but cached and reused.

## Cache Max Age

The `maxAge` of a route loader represents the amount of time in milliseconds to cache the result of the route loader. After this duration, the route loader will be called again to retrieve a fresh result. The `maxAge` of a route loader can be configured in the following ways, each one overriding the next:

- Dispatching a `maxAge` event from the loader using the [loader dispatcher](#loader-dispatcher)
- Passing a `maxAge` option to `useLoadRoute() when prefetching`
- Passing a `loaderMaxAge` option to the route configuration itself
- Passing a `defaultLoaderMaxAge` to the `Router` component

## Loader Dispatcher

The loader dispatcher can be used to imperatively update specific aspects of a router loader's state either during or after the loader has run. This can be useful for:

- Setting a `maxAge` for the route loader based on the loader response
- Triggering background refetches of a route loader
- Extending the cache abilities of a route loader, as is done with the [`react-router-simple-cache`](..) package.

The dispatcher can be accessed in the second options bag argument of the loader function:

```tsx
const routes = [{
  path: 'teams',
  loader: async (match, { dispatch }) => {
    // dispatch(event)
    ...
  },
}]
```

The dispatcher takes an event object as its only argument. The event object must have a `type` property and any additional properties that correspond to that event. Here is the event type:

```tsx
export type LoaderDispatchEvent<
  TGenerics extends PartialGenerics = DefaultGenerics,
> =
  | {
      type: 'maxAge'
      maxAge: number
    }
  | {
      type: 'loading'
    }
  | {
      type: 'resolve'
      data: UseGeneric<TGenerics, 'LoaderData'>
    }
  | {
      type: 'reject'
      error: unknown
    }
```

- The `maxAge` event can be used to set the maxAge of a route loader based on data from inside the loader function, like a response from a server!
- The `loading` event can be used to indicate that the route loader is in a loading state.
- The `resolve` event can be used to indicate that the route loader has completed successfully and is required to pass the new loader data.
- The `reject` event can be used to indicate that the route loader has failed and is required to pass the error that caused the failure.

Here's an example of using a `Response`'s `max-age` header to set the `maxAge` for the loader:

```tsx
const routes = [
  {
    path: 'teams',
    loader: async (_match, { dispatch }) => {
      const teamsRes = await fetch('/api/teams')

      dispatch({
        type: 'maxAge',
        maxAge: Number(teamsRes.headers.get('max-age')),
      })

      return {
        teams: await teamsRes.json(),
      }
    },
  },
]
```

## Handling Loader Errors

Errors caught from the loader function promise are stored in the match state for you to handle in your `errorElement` route element.

To access the error, you can use the `error` property on the match state:

```tsx
const routes = [
  {
    path: 'teams',
    loader: async () => {
      throw new Error('Something went wrong!')
    },
    errorElement: <TeamsError />,
  },
]

function TeamsError() {
  const { error } = useMatch()

  return (
    <div>
      <div>Couldn't load teams!</div>
      <div>{error.message}</div>
    </div>
  )
}
```

## Pending States

Route loaders _and_ async elements both share a set of features to show **pending** states. Because they are shared, we have a dedicated [Pending States](../guides/pending-states) section where you can learn more about them.
