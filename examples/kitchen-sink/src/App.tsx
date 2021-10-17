import * as React from 'react'
import {
  ReactLocation,
  ReactLocationProvider,
  Routes,
  Link,
  Outlet,
  useRoute,
  Route,
} from 'react-location'

// Create a location instance
const location = new ReactLocation()

const App = () => {
  return (
    // Provide the location instance
    <ReactLocationProvider location={location}>
      <Root />
    </ReactLocationProvider>
  )
}

// This is a simple cache that simulates sleep / async behavior with a maxAge before sleeping again.
// Not too different from something like React Query or React's simple cache (except it doesn't
// throw promises like a weirdo!)
const createSleepCache = () => {
  const cache: Record<
    string,
    { time: number; promise?: Promise<any>; data?: any }
  > = {}

  return {
    read: (key: string, data: any, time: number, maxAge: number) => {
      if (cache[key]) {
        if (cache[key].promise) return cache[key].promise
        if (Date.now() - cache[key].time < maxAge) return cache[key].data
      }

      cache[key] = {
        time: Date.now(),
        promise: new Promise((r) => setTimeout(r, time)).then(() => {
          cache[key].time = Date.now()
          cache[key].data = data
          delete cache[key].promise
          return cache[key].data
        }),
      }

      return cache[key].promise
    },
  }
}

export const sleepCache = createSleepCache()

const routes: Route[] = [
  {
    path: '/',
    element: <Home />,
    // This is an async data loader for this route
    // Navigation will suspend until it resolves
    loader: async () => ({
      root: await sleepCache.read('/', Date.now(), 300, 1000 * 10),
    }),
    children: [
      { path: 'search-params', element: <SearchParams /> },
      {
        path: 'teams',
        element: <Teams />,
        errorElement: <LoaderError />,
        pendingElement: 'Still Loading Teams...',
        // Show pending element after 1 second
        pendingMs: 1000,
        // Show the pending element for at least 500ms
        pendingMinMs: 1000,
        loader: async () => {
          if (Math.random() > 0.9) {
            throw new Error('Status 500: Failed to load team data!')
          }
          return {
            // Child loaders merge their results on top of parent loaders
            teams: await sleepCache.read(
              'teams',
              ['team-1', 'team-2', 'team-3'],
              // Soemtimes team data resolves fast, sometimtes slow...
              Math.random() * 2000,
              1000 * 10,
            ),
          }
        },
        children: [
          {
            path: 'new',
            element: 'new',
          },
          {
            path: ':teamId',
            element: <Team />,
            // By default, loaders are parallized, but at any point in the route tree
            // you can require a parent loader to finish before continuing down the
            // tree.
            waitForParents: true,
            loader: async ({ data }) => ({
              // Look ma! I can rely on parent route data!
              teamId: data.teams
                ? await sleepCache.read(':teamId', Date.now(), 300, 1000 * 10)
                : null,
            }),
          },
        ],
      },
      {
        // In this route, the data and element are fetched in parallel
        // because the async element and loader are fetchable up front
        path: 'expensive',
        element: () => import('./Expensive').then((res) => <res.default />),
        loader: async () => ({
          expensive: await sleepCache.read(
            '/expensive',
            Date.now(),
            1000,
            1000 * 10,
          ),
        }),
      },
      {
        // In this route, the data can only be fetched after the entire route
        // module is imported, creating a momentary waterfall
        path: 'really-expensive',
        import: () => import('./ReallyExpensive').then((res) => res.route),
      },
    ],
  },
]

function Root() {
  return <Routes routes={routes} pendingElement="..." />
}

function LoaderError() {
  const route = useRoute()

  return (
    <div>
      <div>Oh no! Something happened when fetching data for this route!</div>
      <pre>{(route.error as Error).message}</pre>
    </div>
  )
}

function Home() {
  const route = useRoute()

  return (
    <div>
      <div>
        <Link to="/">
          <pre>/</pre>
        </Link>
        <Link to="/search-params">
          <pre>/search-params</pre>
        </Link>
        <Link to="/teams">
          <pre>/teams</pre>
        </Link>
        <Link to="/teams/team-2">
          <pre>/teams/team-2</pre>
        </Link>
        <Link to="/expensive">
          <pre>/expensive</pre>
        </Link>
        <Link to="/really-expensive">
          <pre>/really-expensive</pre>
        </Link>
        <Link to="/really-expensive/sub-expensive">
          <pre>/really-expensive/sub-expensive</pre>
        </Link>
      </div>
      <hr />
      Root Data: {JSON.stringify(route.data)}
      <hr />
      <Outlet />
    </div>
  )
}

function Teams() {
  const route = useRoute<{ teams: string[] }>()

  return (
    <div>
      Teams Data: {JSON.stringify(route.data)}
      <hr />
      <div>
        <Link to="..">
          <pre>..</pre>
        </Link>
      </div>
      <div>
        <Link to="new">
          <pre>new</pre>
        </Link>
      </div>
      {route.data.teams.map((team) => {
        return (
          <div key={team}>
            <Link to={team}>
              <pre>{team}</pre>
            </Link>
          </div>
        )
      })}
      <hr />
      <Outlet />
    </div>
  )
}

function Team() {
  const route = useRoute()

  return (
    <div>
      <div>TeamId: {route.params.teamId}</div>
      <div>Team Data: {JSON.stringify(route.data)}</div>
    </div>
  )
}

// The shape of our potential search params
type SearchObj = {
  foo?: boolean
  bar?: string
  someParams?: string
  otherParams?: string
  object?: { nested?: { list?: number[]; hello?: string } }
}

function SearchParams() {
  return (
    <>
      <Link<SearchObj>>
        <pre>{`(none)`}</pre>
      </Link>
      <Link<SearchObj> search={{ foo: true }}>
        <pre>{`search={{ foo: true }}`}</pre>
      </Link>
      <Link<SearchObj> search={(old) => ({ ...old, bar: 'bar' })}>
        <pre>{`search={old => ({ ...old, bar: 'bar' })}`}</pre>
      </Link>
      <Link<SearchObj>
        search={(old) => ({
          ...old,
          someParams: '',
          otherParams: 'gogogo',
          object: { nested: { list: [1, 2, 3], hello: 'world' } },
        })}
      >
        <pre>{`search={old => ({
  ...old,
  someParams: '',
  otherParams: 'gogogo',
  object: { nested: { list: [1, 2, 3], hello: 'world' } },
})}`}</pre>
      </Link>
    </>
  )
}

export default App
