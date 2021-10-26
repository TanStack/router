---
id: api
title: API
---

## ReactLocation

**Required: true**

The `ReactLocation` class is the core engine to React Location. It bridges all of the hooks, components and public API to the underlying history and location APIs. It is required and needs to be provided to your application via the `ReactLocationProvider` component.

| Property | Required | Default                                                  | Description                                                                  |
| -------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| history  | false    | A history will be created automatically if not provided. | The history object to be used internally by react-location                   |
| basepath | false    | `/`                                                      | The basepath prefix for all URLs (not-supported for memory source histories) |

**Example: Basic**

```tsx
import { ReactLocation } from 'react-location'

const reactLocation = new ReactLocation()
```

**Example: Memory History**

```tsx
import { createMemoryHistory, ReactLocation } from 'react-location'

const history = createMemoryHistory()
const reactLocation = new ReactLocation({ history })
```

## ReactLocationProvider

**Required: true**

The `ReactLocationProvider` component is the root Provider component for `react-location` in your app. Render it at least once in the highest sensible location within your application. You can also use this component to preserve multiple location instances in the react tree at the same, which is useful for things like route animations or location mocking.

| Prop     | Required | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| location | true     | An instance of the `ReactLocation` class            |
| children | true     | The children that will receive the location context |

**Example: Basic**

```tsx
import { ReactLocation, ReactLocationProvider } from 'react-location'

const reactLocation = new ReactLocation()

return (
  <ReactLocationProvider location={reactLocation}>
    <div>Your Application</div>
  </ReactLocationProvider>
)
```

## Defining Routes

In React Location, routes are just an array of objects where routes can contain child array's of more routes. It's a route tree!

By default, Routes are matched in the order they are specified, with a few small rules:

- If a route has **no path**, it is considered to have `path: *`
- If a route has **no element**, it is considered to have `element: <Outlet />`
- If a route has both a `path` and `search` defined, both must be matched.
- For Paths:
  - Index routes (`/`) are `exact` by default.
  - The following routes will always match:
    - Param'd routes (eg. `:teamId`)
    - Wildcard routes (`*`)
    - Routes without a `path`
- For Search params:
  - No search params will always match

**Route Loaders, Async Elements, and Imports**

All of these features are essentially **asynchronous routing features** and we'll commonly refer to them as such in these docs.

- All async routing features are called on **every navigation, all the time, regardless of route nesting**.
  - This allows routes loaders to control _all_ aspects of caching. Caching is certainly something with which React Location integrates well, but ultimately, caching is not the core of React Location's responsibility.
- All `loader`s and asynchronous `element`s for the **entire tree** are loaded **in parallel**. _PRO TIP: If you need a route to wait for a parent's promise or data, you can access it via `loader: (match) => match.parentMatch.loaderPromise`_
- Out of the box, React Location **does not cache loaders, async elements or route imports**. We recommend using an external cache for your loader data like `react-location-simple-cache` or our other favorit TanStack library, React Query!
- Route `import`s, due to their nature, cause a temporary waterfall in the parallelization of route loading, but as soon as a route `import` is resolved, any child loaders and async elements will continue in parallel as normal.
- Introducing async behavior into a route usually means you should handle errors too. Use the `errorElement` route option and the `useMatch()` hook to handle and display these errors.

#### Route Properties

A **Route** object consists of the following properties:

| Property       | type                                                                  | Description                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path           | `string`                                                              | The path to match (relative to the nearest parent `Route` component or root basepath)                                                                                                        |
| search         | `shallowSearchObj OR (searchObj: Generics['Search']) => boolean`      | Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched. |
| element        | `React.ReactNode OR ({ params: Params }) => Promise<React.ReactNode>` | The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`                                                                                    |
| errorElement   | `React.ReactNode OR ({ params: Params }) => Promise<React.ReactNode>` | The content to be rendered when `loader` encounters an error                                                                                                                                 |
| pendingElement | `React.ReactNode OR ({ params: Params }) => Promise<React.ReactNode>` | The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration                                                                                        |
| loader         | `(match: RouteMatch) => Promise<Record<string, any>>`                 | An asynchronous function responsible for preparing or fetching data for the route before it is rendered                                                                                      |
| pendingMs      | number                                                                | The duration to wait during `loader` execution before showing the `pendingElement`                                                                                                           |
| pendingMinMs   | number                                                                | _If the `pendingElement` is shown_, the minimum duration for which it will be visible.                                                                                                       |
| children       | Route[]                                                               | An array of child routes                                                                                                                                                                     |
| import         | `({ params: Params }) => Promise<Omit<Route, 'path' / 'import'>>`     |                                                                                                                                                                                              | An asyncronous function that resolves all of the above route information (everything but the `path` and `import` properties, of course). Useful for code-splitting! |

**Example - Route Params**

```tsx
const routes: Route[] = [
  {
    path: 'invoices',
    children: [
      {
        path: '/',
        element: 'This would render at the `/invoices` path',
      },
      {
        path: 'new',
        element: `This would render at the '/invoices/new' path`,
      },
      {
        path: ':invoiceId',
        element: <Invoice />,
      },
    ],
  },
]
```

**Example - Default / Fallback Route**

```tsx
const routes: Route[] = [
  {
    path: '/',
  },
  {
    path: 'about',
  },
  {
    // Passing no route is equivalent to passing `path: '*'`
    element: `This would render as the fallback when '/' or '/about' were not matched`,
  },
]
```

**Example - Default / Fallback Route with client-side redirect**

```tsx
const routes: Route[] = [
  {
    path: '/',
    element: 'I am groot!',
  },
  {
    path: 'about',
    element: 'About me.',
  },
  {
    element: <Navigate to="/" />,
  },
]
```

**Example - Root Wrapper**

```tsx
const routes: Route[] = [
  {
    // Defaults to:
    // path: '*'
    // element: <Outlet />
    loader: () => Promise.resolve({ data: 'some global data' }),
    children: [
      {
        path: '/',
        element: 'I am groot!',
      },
      {
        path: 'about',
        element: 'About me.',
      },
      {
        element: <Navigate to="/" />,
      },
    ],
  },
]
```

**Example - Data Loaders**

```tsx
const routes: Route[] = [
  {
    path: '/',
    element: <Home />,
  },
  {
    path: 'dashboard',
    element: <Dashboard />,
  },
  {
    path: 'invoices',
    element: <Invoices />,
    // Load invoices before rendering
    load: async () => ({
      invoices: await fetchInvoices(),
    }),
    children: [
      {
        path: 'new',
        element: <NewInvoice />,
      },
      {
        path: ':invoiceId',
        element: <Invoice />,
        // Load the individual invoice before rendering
        load: async ({ params }) => ({
          invoice: await fetchInvoiceById(params.invoiceId),
        }),
      },
    ],
  },
]
```

**Example - Code Splitting**

> NOTE: Because of the asynchronous nature of code-split routes,
> subsequent loaders and child route configurations are unknown
> untile the import is resolved. Thus, any further asynchronous
> dependencies they result in (loaders or child routes)
> cannot be loaded in parallel.
>
> Regardless, they still suspend navigation as you would expect!

```tsx
const routes: Route[] = [
  {
    path: '/',
    element: <Home />,
  },
  {
    path: 'expensive',
    import: async () => {
      return import('./Expensive').then((res) => res.route)
      // Expensive.route === {
      //   element: <Expensive />,
      //   data: async ({ params }) => ({
      //     expensiveStuff: {...}
      //   }),
      // }
    },
  },
]
```

## Routes & useRoutes

The `Routes` component and `useRoutes` hook are used to conditionally match and render the matching route tree from the router based on the current location.

| Property       | Required | type              | Description                                                                                                                                                                      |
| -------------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| routes         | true     | `Route[]`         | An array of routes to match                                                                                                                                                      |
| pendingElement |          | `React.ReactNode` | The content to be rendered while the first route match is being loaded. To avoid this element, consider using an [SRR](#ssr) approach to pre-load your route data on the server. |
| initialMatch   |          | RouteMatch        | A route match object that has been both _matched_ and _loaded_. See the [SRR](#ssr) section for more details                                                                     |

```tsx
const routes: Route[] = [
  // ...
]

function App() {
  return <Routes routes={routes} />
}
```

```tsx
const routes: Route[] = [
  // ...
]

function App() {
  const routeElement = useRoutes({ routes })

  return <div>{routeElement}</div>
}
```

## useMatch

The `useMatch` hook returns the nearest current route match within context of where it's called. It can be used to access:

- Route Data
- Route Params (eg. `/:invoiceId` => `params.invoiceId`)
- The next child match, if applicable

**Example - Route Data**

```tsx
function App() {
  return (
    <Routes
      routes={[
        {
          path: 'invoices',
          element: <Invoices />,
          load: async () => ({
            invoices: await fetchInvoices(),
          }),
          children: [
            {
              path: ':invoiceId',
              element: <Invoice />,
              load: async ({ params }) => ({
                invoice: await fetchInvoiceById(params.invoiceId),
              }),
            },
          ],
        },
      ]}
    />
  )
}

function Invoice() {
  const {
    data: {
      // You can access any data merged in from parent loaders as well
      invoices,
      invoice,
    },
  } = useMatch()
}
```

**Example - Route Params**

```tsx
function App() {
  return (
    <Routes
      routes={[
        {
          path: 'invoices',
          element: <Invoices />,
          children: [
            {
              path: ':invoiceId',
              element: <Invoice />,
            },
          ],
        },
      ]}
    />
  )
}

function Invoice() {
  const {
    params: { invoiceId },
  } = useMatch()

  // Use it for whatever, like in a React Query!
  const invoiceQuery = useQuery(
    ['invoices', invoiceId],
    fetchInvoiceById(invoiceId)
  )
}
```

## useMatches

The `useMatches` hook is similar to the `useMatch` hook, except it returns an array of all matches from the current match down. If you are looking for a list of all matches, you'll want to use `useRouterState().matches`.

**Example - Route Data**

```tsx
function Invoice() {
  const matches = useMatches()
}
```

## Search Params

In React Location, search params are considered first-class objects that can be immutably updated safely and consistently in a similar fashion to `React.useState`s `setState(replacementObj)` and `setState((old) => new)` patterns.

**Parsing & Serialization**

The first level of search params always have standard encoding, eg. `?param1=value&param2=value&param3=value`. This keeps things at the root level of the search params experience as compatible as possible with the rest of the web ecosystem. There are many tools frameworks and core web browsers APIs that use this basic expectation. **Starting with at value level of search params, however, React Location offers much more power**.

- By default, React Location uses `JSON.parse` and `JSON.stringify` to ensure your search params can contain complex JSON objects.
- Custom `stringifySearch` and `parseSearch` functions can be provided to your `ReactLocation` instance to further enhance the way search objects are encoded. We suggest using our `react-location-jsurl` package if you're truly looking for the best UX around search param encoding. It keeps urls small, readable and safely encoded for users to share and bookmark.
- Regardless of the serialization strategy you pick for React Location, it will _always_ gauranty a stable, immutable and structurally-safe object reference. This means that even though your search params' source of truth is technically a string, it will behave as if it is an immutable object, stored in your application's memory.

## useSearch

The `useSearch` hook provides access to the search params state for the current location. This JSON object is immutable from render to render through structural sharing so any part of it can be safely used for change-detection, even in useEffect/useMemo dependencies.

**Example - Basic**

```tsx
import { Router, MakeGenerics } from 'react-location'

type MyLocationGenerics = MakeGenerics<{
    Search: {
      pagination?: {
        index?: number
        size?: number
      }
      filters?: {
        name?: string
      }
      desc?: boolean
    }
  }>
>

function MyComponent() {
  const search = useSearch<MyLocationGenerics>()

  console.info(search)
  // {
  //   pagination: {
  //     index: 1,
  //     size: 20
  //   },
  //   filter: {
  //     name: 'tanner'
  //   },
  //   desc: true
  // }
}
```

**Example - Updating URL Search Params State**

```tsx
type MyLocationGenerics = MakeGenerics<{
    Search: {
      pagination?: {
        index?: number
        size?: number
      }
      filters?: {
        name?: string
      }
      desc?: boolean
    }
  }>
>


function MyComponent() {
  const navigate = useNavigate<MyLocationGenerics>()

  const nextPage = () => {
    navigate({
      // All typesafe!
      search: (old) => ({
        ...old,
        pagination: {
          ...old.pagination,
          index: old.pagination.index + 1,
        },
      }),
    })
  }

  // OR use something like immer!

  const nextPage = () => {
    navigate({
      search: (old) =>
        immer.produce(old, (draft) => {
          draft.pagination.index++
        }),
    })
  }
}
```

### Link

The `Link` component allows you to generate links for _internal_ navigation, capable of updating the:

- Pathname
- Search Parameters
- Hash
- Push vs. Replace

The links generated by it are designed to work perfectly with `Open in new Tab` + `ctrl + left-click` and `Open in new window...`. They are also capable of receiving "active" props (depending on the `activeOptions` passed) to decorate the link when the link is currently active relative to the current location.

| Prop                                                      | Description                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ...[NavigateProps](#navigate)                             | All properties for the [<Navigate /> component](#navigate) method are supported here.                                                                                                                                                    |
| activeOptions?: { exact?: boolean, includeHash?: boolean} | Defaults to `{ exact: false, includeHash: false }`                                                                                                                                                                                       |
| getActiveProps: () => PropsObject                         | A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated) |

**Example: The basics**

```tsx
function App() {
  return (
    <div>
      <Link to="/home">I will navigate to `/home`</Link>
      <Link to="todos">
        I will navigate to `./todos`, relative to the current location
      </Link>
      <Link to="..">
        I will navigate up one level in the location hierarchy.
      </Link>
      <Link to="." hash="somehash">
        I will update the hash to `somehash` at the current location
      </Link>
      <Link to="/search" search={{ q: 'yes' }}>
        I will navigate to `/search?q=yes`
      </Link>
      <Link
        to="."
        search={{
          someParams: true,
          otherParams: 'gogogo',
          object: { nested: { list: [1, 2, 3], hello: 'world' } },
        }}
      >
        I will navigate to the current location +
        `?someParams=true&otherParams=gogogo&object=~(nested~(list~(~1~2~3)~hello~%27world))`
      </Link>
      <Link
        search={({ removeThis, ...rest }) => ({
          ...rest,
          addThis: 'This is new!',
        })}
      >
        I will add `addThis='This is new!' and also remove the `removeThis`
        param to/from the search params on the current page
      </Link>
    </div>
  )
}
```

**Example: Using `getActiveProps`**

The following link will be green with `/about` as the current location.

```tsx
<Link
  to="/about"
  getActiveProps={(location) => ({
    style: { color: 'green' },
  })}
>
  About
</Link>
```

### Navigate

When renderd, the `Navigate` component will declaratively and relatively navigate to any route.

| Prop    | Description                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| to      | The new relative or absolute pathname                                                                            |
| search  | A new search params object, or a function that receives the latest search params object and returns the new one. |
| hash    | The new hash string                                                                                              |
| replace | If `true`, the new location will replace the current entry in the history stack instead of creating a new one.   |

**Example**

```tsx
function App () {
  return <Navigate to='./about'>
}
```

### useNavigate

The `useNavigate` hook allows you to programmatically navigate your application.

**Usage**

```tsx
function MyComponent() {
  const navigate = useNavigate()

  const onClick = () => {
    navigate({ to: './about', replace: true })
  }

  return <button onClick={onClick}>About</button>
}
```

### useMatch

The `useMatch` hook allows you to programmatically test a relative path against the current location. If a path is match, it will return an object of route params detected, even if this is an empty object. If a path doesn't match, it will return `false`. This can be useful for detecting specific deep-route matches from a layout component

**Usage**

```tsx
function App() {
  return (
    <Routes
      routes={[
        {
          element: <Root />,
          children: [
            {
              path: '/',
              element: 'Hello!',
            },
            {
              path: ':teamId',
              element: 'Hello!',
            },
          ],
        },
      ]}
    />
  )
}

function Root() {
  const matchRoute = useMatchRoute()

  // If the path is '/'
  matchRoute({ to: '/' }) // {}
  matchRoute({ to: ':teamId' }) // false

  // If the path is `/team-1'
  matchRoute({ to: '/' }) // false
  matchRoute({ to: '/*' }) // {}
  matchRoute({ to: ':teamId' }) // { teamId: 'team-1 }

  return <Routes />
}
```

### useRouterState

The `useRouterState` hook can be used to gain access to the state of the closest `useRoutes()` element or `<Routes />` element. It's shape looks like this:

| Property         | Type         | Description                                                                                                      |
| ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| matches          | RouteMatch[] | The current set of matches that are being rendered                                                               |
| previousMatches  | RouteMatch[] | The previous set of matches before the last committed navigation                                                 |
| nextMatches      | RouteMatch[] | The next set of matches that are being loaded                                                                    |
| previousLocation | Location     | The previous location snapshot                                                                                   |
| currentLocation  | Location     | The current location snapshot                                                                                    |
| nextLocation     | Location     | The next location snapshot                                                                                       |
| isTransitioning  | boolean      | Will be `true` if the router is currently transitioning                                                          |
| isLoading        | boolean      | Will be `true` if any matches in the route are currently in a loading state, including background loading states |

### useResolvePath

The `useResolvePath` hook returns a function that can be used to resolve the full path of a relative route, based on where the hook is called in the route hierarchy.

** Example **

```tsx
function App() {
  return (
    <Routes
      routes={[
        {
          path: 'workspaces',
          children: [
            {
              path: 'team',
              element: <Team />,
            },
          ],
        },
      ]}
    />
  )
}

function Team() {
  const resolvePath = useResolvePath()

  const parentPath = resolvePath('..') // /workspace
  const parentPath = resolvePath('.') // /workspace/team
  const parentPath = resolvePath('team-1') // /workspace/team/team-1
}
```

### useIsNextPath

The `useIsNextPath` hook provides a function to test whether a relative path is the next destination that is currently being loaded by the nearest

** Example **

```tsx
function Post() {
  const isNextPath = useIsNextPath()

  return (
    <div>
      <Link to="..">Back {isNextPath('..') ? '...' : ''}</Link>
      ...
    </div>
  )
}
```

It is essentially a shorthand hook for the following:

```tsx
function Post() {
  const routerState = useRouterState()
  const resolvePath = useResolvePath()

  routerState.nextLocation?.pathname === resolvePath('..') // true | false
}
```

### SSR

If you at all serious about SSR Routing, then you should probably investigate using a framework like [Remix](https://remix.run) or [Next.js](https://nextjs.org).

However, if you truly desire to fudge around with SSR in React Location to avoid that initial pending state, you can! Use `createMemoryHistory` and `ReactLocation` to mock your app into a specific state for SSR, then use the manual routing tools to match and load the correct route information. You can then serialize this inital match info into your document to be rehydrated on the client.

```tsx
// Server.tsx
import { createMemoryHistory, ReactLocation, Router } from 'react-location'

export async function render(requestUrl) {
  // Get the URL pathname
  const url = new URL(requestUrl)
  // Create a memory history with the pathname
  let history = createMemoryHistory([url.pathname])
  // Create the location instance
  const location = new ReactLocation({ history })
  // Define your routes
  const routes: Route[] = [
    // ...
  ]
  // Match the routes to the locations current path
  // This also performs any route imports
  const initialMatch = await matchRoutes(routes, location.current)

  // Now we run all of the parallizable work
  if (initialMatch) {
    await loadMatches(initialMatch).promise
  }

  const markup = ReactDOMServer.renderToString(
    <ReactLocationProvider>
      <Routes initialMatch={initialMatch} routes={routes} />
    </ReactLocationProvider>
  )

  // Serialize the initialMatch into your HTML
  const script = `
    <script>
      window.__initialMatch = ${JSON.stringify(intitialMatch)}
    </script>
  `
}
```

```tsx
// Client.tsx
import { createBowserHistory, ReactLocation, Router } from 'react-location'

const location = new ReactLocation({ history })

export function App() {
  return (
    <ReactLocationProvider location={location}>
      <Routes routes={routes} initialMatch={window.__initialMatch} />)
    </ReactLocationProvider>
  )
}
```
