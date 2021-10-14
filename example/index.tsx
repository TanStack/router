import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  ReactLocation,
  ReactLocationProvider,
  Routes,
  Link,
  Outlet,
  useRoute,
} from 'react-location'

type SearchObj = {
  foo?: string
  someParams?: string
  otherParams?: string
  object?: { nested?: { list?: number[]; hello?: string } }
}

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
  const cache: Record<string, { time: number; promise?: Promise<any> }> = {}

  return {
    read: (key: string, time: number, maxAge: number) => {
      if (cache[key]) {
        if (cache[key].promise) return cache[key].promise
        if (Date.now() - cache[key].time < maxAge) return cache[key].time
      }

      cache[key] = {
        time: Date.now(),
        promise: new Promise(r => setTimeout(r, time)).then(() => {
          cache[key].time = Date.now()
          delete cache[key].promise
          return cache[key].time
        }),
      }

      return cache[key].promise
    },
  }
}

export const sleepCache = createSleepCache()

function Root() {
  return (
    <>
      <div>
        <Link to="/">
          <pre>/</pre>
        </Link>
        <Link<SearchObj> search={old => ({ ...old, foo: 'bar' })}>
          <pre>{`search={old => ({ ...old, foo: 'bar' })}`}</pre>
        </Link>
        <Link<SearchObj>
          search={{
            someParams: '',
            otherParams: 'gogogo',
            object: { nested: { list: [1, 2, 3], hello: 'world' } },
          }}
        >
          <pre>{`search={{
  someParams: '',
  otherParams: 'gogogo',
  object: { nested: { list: [1, 2, 3], hello: 'world' } },
}}`}</pre>
        </Link>
        <Link to="/teams">
          <pre>/teams</pre>
        </Link>
        <Link to="/expensive">
          <pre>/expensive</pre>
        </Link>
      </div>
      <hr />
      <Routes
        // You can define your routes inline and without any memoization
        fallback={'...'}
        routes={[
          {
            path: '/',
            element: <Home />,
            // This is an async data loader for this route
            // Navigation will suspend until it resolves
            loader: async () => ({
              root: await sleepCache.read('/', 300, 1000 * 10),
            }),
            children: [
              {
                path: 'teams',
                element: <Teams />,
                loaderErrorElement: <LoaderError />,
                loader: async () => {
                  if (Math.random() > 0.9) {
                    throw new Error('Status 500: Failed to load team data!')
                  }
                  return {
                    // Child loaders merge their results on top of parent loaders
                    teams: await sleepCache.read('teams', 1000, 1000 * 10),
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
                        ? await sleepCache.read(':teamId', 300, 1000 * 10)
                        : null,
                    }),
                  },
                ],
              },
              {
                path: 'expensive',
                import: () => import('./Expensive').then(res => res.route),
              },
            ],
          },
        ]}
      />
    </>
  )
}

function LoaderError() {
  const route = useRoute()

  return (
    <div>
      <div>Oh no! Something happened when fetching data for this route!</div>
      <pre>{(route.dataError as Error).message}</pre>
    </div>
  )
}

function Home() {
  const route = useRoute()

  return (
    <div>
      Root Data: {JSON.stringify(route.data)}
      <hr />
      <Outlet />
    </div>
  )
}

function Teams() {
  const route = useRoute()

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
      <div>
        <Link to="team-1">
          <pre>team-1</pre>
        </Link>
      </div>
      <div>
        <Link to="./team-2">
          <pre>./team-2</pre>
        </Link>
      </div>
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

ReactDOM.render(<App />, document.getElementById('root'))
