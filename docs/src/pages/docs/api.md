---
id: api
title: API
---

## ReactLocation

**Required: true**

The `ReactLocation` class is the core engine to React Location. It bridges all of the hooks, components and public API to the underlying history and location APIs. It is required and needs to be provided to your application via the `ReactLocationProvider` component.

```tsx
export type ReactLocationOptions<TGenerics> = {
  // The history object to be used internally by react-location
  // A history will be created automatically if not provided.
  history?: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
}

// These options are also available to pass to the <Router /> component
export type RouterOptions<TGenerics> = {
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  routes?: Route<TGenerics>[]
  initialMatches?: Match<TGenerics>[]
}
```

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

## Router

**Required: true**

The `Router` component is the root Provider component for the `react-location` instance and your route configuration in your app. Render it _only once_ (rendering multiple routers is an anti-pattern, and straight-up not supported for good reason).

- If no `children` prop is passed, it will default to `<Outlet />` which will start rendering your route matches.
- if a `children` prop is passed, you must eventually render `<Outlet />` where you want your routes to start rendering

```tsx
export type RouterProps<TGenerics> = {
  // An instance of the `ReactLocation` class
  location: ReactLocation<TGenerics>
  basepath?: string
  // Children will default to `<Outlet />` if not provided
  children?: React.ReactNode
  // An array of route objects to match
  routes?: Route<TGenerics>[]
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  defaultElement?: SyncOrAsyncElement<TGenerics>
  defaultErrorElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  // An array of route match objects that have been both _matched_ and _loaded_. See the [SRR](#ssr) section for more details
  initialMatches?: Match<TGenerics>[]
}
```

**Example: Basic**

```tsx
import { ReactLocation, Router } from 'react-location'

const reactLocation = new ReactLocation()

return (
  <Router
    location={reactLocation}
    routes={[
      {
        path: '/',
        element: 'Home on the range!',
      },
    ]}
  />
)
```

**Example: With Children**

```tsx
import { ReactLocation, Router, Outlet } from 'react-location'

const reactLocation = new ReactLocation()

return (
  <Router
    location={reactLocation}
    routes={[
      {
        path: '/',
        element: 'Home on the range!',
      },
    ]}
  >
    <div>Header</div>
    <Outlet />
  </Router>
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
- Unless you specify a dependency on a parent route's promise, **all `loader`s and asynchronous `element`s for the entire tree are loaded in parallel!**. _If you need a route to wait for a parent's promise or data, you can access it via `loader: (match) => match.parentMatch.loaderPromise`_
- Out of the box, React Location **only caches loaders and async elements for routes that are currently rendered on the screen**. If you need more caching than this, you can play with the `defaultLoaderMaxAge` option on the `<Router />` component or better yet, we recommend using an external cache for your loader data like `react-location-simple-cache` or our other favorite TanStack library, React Query!
- Introducing async behavior (loaders and async elements) into a route usually means you should handle errors too. Use the `errorElement` route option and the `useMatch()` hook to handle and display these errors.

#### Route Properties

```tsx
export type Route<TGenerics extends PartialGenerics = DefaultGenerics> =
  // Route Loaders (see below) can be inline on the route, or resolved async
  // via the `import` property
  RouteLoaders<TGenerics> & {
    // The path to match (relative to the nearest parent `Route` component or root basepath)
    path?: string
    // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
    // The duration to wait during `loader` execution before showing the `pendingElement`
    pendingMs?: number
    // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
    pendingMinMs?: number
    // Search filters can be used to rewrite, persist, default and manipulate search params for link that
    // point to their routes or child routes. See the "basic" example to see them in action.
    searchFilters?: SearchFilter<TGenerics>[]
    // An array of child routes
    children?: Route<TGenerics>[]
  } & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: UseGeneric<TGenerics, 'Params'>
    }) => Promise<RouteLoaders<TGenerics>>
  }

export type RouteLoaders<TGenerics> = {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: SyncOrAsyncElement<TGenerics>
  // The content to be rendered when `loader` encounters an error
  errorElement?: SyncOrAsyncElement<TGenerics>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: SyncOrAsyncElement<TGenerics>
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TGenerics>
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: UseGeneric<TGenerics, 'RouteMeta'>
}

export type SearchFilter<TGenerics> = (
  prev: UseGeneric<TGenerics, 'Search'>,
  next: UseGeneric<TGenerics, 'Search'>
) => UseGeneric<TGenerics, 'Search'>
```

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

```tsx
const routes: Route[] = [
  {
    path: '/',
    element: <Home />,
  },
  {
    path: 'expensive',
    // Code-split Element
    element: () => import('./Expensive').then((mod) => <mod.default />),
    // Code-split Loader
    loader: async (...args) =>
      import('./Expensive').then((mod) => mod.loader(...args)),
  },
]
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

The `useMatches` hook is similar to the `useMatch` hook, except it returns an array of all matches from the current match down. If you are looking for a list of all matches, you'll want to use `useRouter().matches`.

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
- Regardless of the serialization strategy you pick for React Location, it will _always_ guarantee a stable, immutable and structurally-safe object reference. This means that even though your search params' source of truth is technically a string, it will behave as if it is an immutable object, stored in your application's memory.

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

```tsx
export type LinkProps<TGenerics extends PartialGenerics = DefaultGenerics> =
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
    // The absolute or relative destination pathname
    to?: string | number | null
    // The new search object or a function to update it
    search?: true | Updater<UseGeneric<TGenerics, 'Search'>>
    // The new has string or a function to update it
    hash?: Updater<string>
    // Whether to replace the current history stack instead of pushing a new one
    replace?: boolean
    // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
    getActiveProps?: () => Record<string, any>
    // Defaults to `{ exact: false, includeHash: false }`
    activeOptions?: ActiveOptions
    // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
    preload?: number
    // A custom ref prop because of this: https://stackoverflow.com/questions/58469229/react-with-typescript-generics-while-using-react-forwardref/58473012
    _ref?: React.Ref<HTMLAnchorElement>
    // If a function is pass as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }

export type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
}
```

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

**Example: Using a child function for further active state customization**

The following link will contain an `<ActiveIcon/>` prefix when active

```tsx
<Link to="/about">
  {({ isActive }) => {
    return (
      <>
        {isActive ? (
          <>
            <ActiveIcon />{' '}
          </>
        ) : null}
        About
      </>
    )
  }}
</Link>
```

### Navigate

When renderd, the `Navigate` component will declaratively and relatively navigate to any route.

```tsx
export type NavigateOptions<
  TGenerics extends PartialGenerics = DefaultGenerics
> = {
  // The new relative or absolute pathname
  to?: string | null
  // A new search params object, or a function that receives the latest search params object and returns the new one.
  search?: Updater<UseGeneric<TGenerics, 'Search'>>
  // The new hash string
  hash?: Updater<string>
  // If set to 'true', will replace the current state instead of pushing a new one onto the stack
  replace?: boolean
  // If `true`, the new location will replace the current entry in the history stack instead of creating a new one.
  fromCurrent?: boolean
  // If set will update the key of the new location
  key?: string
  // ADVANCED. Can be used to set the relative origin of the navigation for resolution
  from?: Partial<Location<TGenerics>>
}
```

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

### useMatchRoute

The `useMatchRoute` hook allows you to programmatically test both relative and absolute paths against the current or pending location. If a path is match, it will return an object of route params detected, even if this is an empty object. This can be useful for:

- Detecting specific deep-route matches from a layout component
- Determining if a specific route is the next pending location that is being transitioned to

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

  // If the current path is '/'
  matchRoute({ to: '/' }) // {}
  matchRoute({ to: ':teamId' }) // undefined

  // If the current path is `/team-1'
  matchRoute({ to: '/' }) // undefined
  matchRoute({ to: '/', fuzzy: true }) // {}
  matchRoute({ to: '/*' }) // { '*': 'team-1' }
  matchRoute({ to: ':teamId' }) // { teamId: 'team-1 }

  // If the pending path is `/team-1`
  matchRoute({ to: ':teamId' }) // undefined
  matchRoute({ to: ':teamId', pending: true }) // { teamId: 'team-1 }

  return <Routes />
}
```

### MatchRoute

The `MatchRoute` component is merely a component-version of `useMatchRoute`. It takes all of the same options, but comes with some different affordances.

- If the options provided _do not_ result in a match, `null` will be rendered.
- If the options provided **do** result in a match
  - If `children` is a `React.ReactNode`, `children` will be rendered
  - If `children` is a function, it will be called with resulting match params, or an empty object if no params were found.

**Example: Rendering ellipsis if the pending route matches**

```tsx
function Example() {
  return (
    <Link to="dashboard">
      Dashboard{' '}
      <MatchRoute to="dashboard" pending>
        ...
      </MatchRoute>
    </Link>
  )
}
```

### useRouter

The `useRouter` hook can be used to gain access to the state of the parent `<Router />` component It's shape looks like this:

```tsx
export type Router<TGenerics extends PartialGenerics = DefaultGenerics> =
  // The resolved options used in the router
  RouterProps<TGenerics> & {
    // The current transition state of location + matches that has been successfully matched and loaded
    state: TransitionState<TGenerics>
    // The next/pending transition state of location + matches that is being matched and loaded
    pending?: TransitionState<TGenerics>
  }

export type TransitionState<TGenerics> = {
  status: 'pending' | 'ready'
  location: Location<TGenerics>
  matches: Match<TGenerics>[]
}
```

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

### SSR

If you at all serious about SSR Routing, then you should probably investigate using a framework like [Remix](https://remix.run) or [Next.js](https://nextjs.org).

However, if you truly desire to fudge around with SSR in React Location to avoid that initial pending state, you can! Use `createMemoryHistory` and `ReactLocation` to mock your app into a specific state for SSR, then use the manual routing tools to match and load the correct route information. You can then serialize this initial match info into your document to be rehydrated on the client.

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
  const initialMatches = matchRoutes(routes, location.current)

  // Now we run all of the parallelizable work
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
      window.__initialMatch = ${JSON.stringify(initialMatch)}
    </script>
  `
}
```

```tsx
// Client.tsx
import { createBrowserHistory, ReactLocation, Router } from 'react-location'

const location = new ReactLocation({ history })

export function App() {
  return (
    <ReactLocationProvider location={location}>
      <Routes routes={routes} initialMatch={window.__initialMatch} />)
    </ReactLocationProvider>
  )
}
```
