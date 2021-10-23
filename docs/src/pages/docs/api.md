---
id: api
title: API
---

### ReactLocation

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

### ReactLocationProvider

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

### Routes & useRoutes

The `Routes` component and `useRoutes` hook are used to render an active route from an array (or tree) of **Route** objects.

Rotues are matched in the order of:

- Exact match index paths (`/`)
- Hard-coded paths in the order of appearance (eg. `about`)
- Dynamic paths (eg. `:teamId`) **OR** a wildcard path (`*`)

| Property       | Required | type              | Description                                                                                                  |
| -------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| routes         | true     | `Route[]`         | An array of routes to match                                                                                  |
| pendingElement |          | `React.ReactNode` | The content to be rendered while the first route match is being loaded                                       |
| initialMatch   |          | RouteMatch        | A route match object that has been both _matched_ and _loaded_. See the [SRR](#ssr) section for more details |

### Route

A **Route** object consists of the following properties:

| Property       | Required | type                                                                  | Description                                                                                             |
| -------------- | -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path           | true     | `string`                                                              | The path to match (relative to the nearest parent `Route` component or root basepath)                   |
| element        |          | `React.ReactNode OR ({ params: Params }) => Promise<React.ReactNode>` | The content to be rendered when the route is matched                                                    |
| errorElement   |          | `React.ReactNode OR ({ params: Params }) => Promise<React.ReactNode>` | The content to be rendered when `loader` encounters an error                                            |
| pendingElement |          | `React.ReactNode OR ({ params: Params }) => Promise<React.ReactNode>` | The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration   |
| loader         |          | `(match: RouteMatch) => Promise<Record<string, any>>`                 | An asynchronous function responsible for preparing or fetching data for the route before it is rendered |
| pendingMs      |          | number                                                                | The duration to wait during `loader` execution before showing the `pendingElement`                      |
| pendingMinMs   |          | number                                                                | _If the `pendingElement` is shown_, the minimum duration for which it will be visible.                  |
| children       |          | Route[]                                                               | An array of child routes                                                                                |
| import         |          | `({ params: Params }) => Promise<Omit<Route, 'path' / 'import'>>`     |                                                                                                         | An asyncronous function that resolves all of the above route information (everything but the `path` and `import` properties, of course). Useful for code-splitting! |

**Example - Route Params**

```tsx
const routeElement = (
  <Routes
    routes={[
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
    ]}
  />
)

function Invoice() {
  const params = useParams<{ invoiceId: string }>()

  return (
    <div>
      <Link to="..">Back</Link>
      <div>This is invoice #{params.invoiceID}</div>
    </div>
  )
}
```

**Example - Default / Fallback Route**

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: '/',
      },
      {
        path: 'about',
      },
      {
        path: '*',
        element: `This would render as the fallback when '/' or '/about' were not matched`,
      },
    ]}
  />
)
```

**Example - Default / Fallback Route with client-side redirect**

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: '/',
      },
      {
        path: 'about',
      },
      {
        path: '*',
        element: <Navigate to="/" />,
      },
    ]}
  />
)
```

**Example - Data Loaders**

```tsx
const routeElement = (
  <Routes
    routes={[
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
    ]}
  />
)
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
const routeElement = (
  <Routes
    routes={[
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
    ]}
  />
)
```

### useRoute

The `useRoute` hook returns the nearest current route match within context of where it's called. It can be used to access:

- Route Data
- Route Params (eg. `/:invoiceId` => `params.invoiceId`)
- The next child match, if applicable

**Example - Route Data**

```tsx
const routeElement = (
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

function Invoice() {
  const {
    data: {
      // You can access any data merged in from parent loaders as well
      invoices,
      invoice,
    },
  } = useRoute()
}
```

**Example - Route Params**

```tsx
const routeElement = (
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

function Invoice() {
  const {
    params: { invoiceId },
  } = useRoute()

  // Use it for whatever, like in a React Query!
  const invoiceQuery = useQuery(
    ['invoices', invoiceId],
    fetchInvoiceById(invoiceId)
  )
}
```

## useSearch

The `useSearch` hook provides access to the URL search state for the current location. This JSON object is immutable from render to render through structural sharing so any part of it can be safely used for change-detection, even in useEffect/useMemo dependencies.

**Example - Basic**

```tsx
type SearchObj = {
  pagination?: {
    index?: number
    size?: number
  }
  filters?: {
    name?: string
  }
  desc?: boolean
}

function MyComponent() {
  // You should try to always pass a generic to `useSearch`
  // or better yet, make your own pre-typed `useSearch` that proxies
  // the original.

  const search = useSearch<SearchObj>()

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

**Example - Updating URL Search State**

```tsx
type SearchObj = {
  pagination?: {
    index?: number
    size?: number
  }
  filters?: {
    name?: string
  }
  desc?: boolean
}

function MyComponent() {
  // You should try to always pass a generic to `useSearch`
  // or better yet, make your own pre-typed `useSearch` that proxies
  // the original.

  const navigate = useNavigate<SearchObj>()

  const nextPage = () => {
    navigate({
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
- Location State
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
render(
  <div>
    <Link to="/home">I will navigate to `/home`</Link>
    <Link to="todos">
      I will navigate to `./todos`, relative to the current location
    </Link>
    <Link to="..">I will navigate up one level in the location hierarchy.</Link>
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
      I will add `addThis='This is new!' and also remove the `removeThis` param
      to/from the search params on the current page
    </Link>
  </div>
)
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

**Type**

```ts
type NavigateProps = {
  to?: string | null
  pathname?: string | null
  search?: Updater<SearchObj>
  hash?: Updater<string>
  replace?: boolean
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
    navigate('./about', { replace: true })
  }

  return <button onClick={onClick}>About</button>
}
```

### useMatch

The `useMatch` hook allows you to programmatically test a path for a route **within the closest relative route**. If a path is match, it will return an object of route params detected, even if this is an empty object. If a path doesn't match, it will return `false`. This can be useful for detecting specific deep-route matches from a layout component

**Usage**

```tsx
function App() {
  const match = useMatch()

  // If the path is '/'
  match('/') // {}
  match(':teamId') // false

  // If the path is `/team-1'
  match('/') // {}
  match('/', { exact: true }) // false
  match(':teamId') // { teamId: 'team-1 }

  return (
    <Routes
      routes={[
        {
          path: '/',
          element: 'Hello!',
        },
        {
          path: ':teamId',
          element: 'Hello!',
        },
      ]}
    />
  )
}
```

### useRouterState

The `useRouterState` hook can be used to gain access to the state of the closes `useRoutes` or `<Routes />` boundar that's being rendered. It's shape looks like this:

| Property         | Type       | Description                                                                                                      |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| currentMatch     | RouteMatch | The current RouteMatch object that is being rendered                                                             |
| previousLocation | Location   | The previous location snapshot                                                                                   |
| currentLocation  | Location   | The current location snapshot                                                                                    |
| nextLocation     | Location   | The next location snapshot                                                                                       |
| isTransitioning  | boolean    | Will be `true` if the router is currently transitioning                                                          |
| isLoading        | boolean    | Will be `true` if any matches in the route are currently in a loading state, including background loading states |

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

If you at all serious about SSR Routing, you should probably use a framework like [Remix](https://remix.run) or [Next.js](https://nextjs.org).

However, if you truly desire to fudge around with SSR in React Location, you can. Use `createMemoryHistory` and `ReactLocation` to mock your app into a specific state for SSR:

```tsx
import {
  createBowserHistory,
  createMemoryHistory,
  ReactLocation,
} from 'react-location'

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
  // This also does any `import`s and async elements defined in routes
  const routeMatch = await matchRoutes(location.current.pathname, routes)
  // Perform any loading required for the matched route
  await loadMatch(routeMatch)

  ReactDOMServer.renderToString(
    <ReactLocationProvider>
      <Routes initialMatch={routeMatch} routes={routes} />
    </ReactLocationProvider>
  )
}
```
