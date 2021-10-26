import { render } from 'react-dom'
import {
  ReactLocation,
  ReactLocationProvider,
  MakeGenerics,
  Router,
} from 'react-location'
import { ReactLocationSimpleCache } from 'react-location-simple-cache'

//

export type LocationGenerics = MakeGenerics<{
  LoaderData: {
    root: number
    teams: string[]
    teamId: number
    expensive: number
    reallyExpensive: number
    subExpensive: number
  }
  Search: SearchObj
}>

// The shape of our potential search params
type SearchObj = {
  foo?: boolean
  bar?: string
  someParams?: string
  otherParams?: string
  object?: { nested: { list: number[]; hello: string } }
}

//

const location = new ReactLocation<LocationGenerics>()
export const simpleCache = new ReactLocationSimpleCache<LocationGenerics>()
export const router = new Router<LocationGenerics>({
  routes: [
    {
      element: <Home />,
      // This is an async data loader for this route
      // Navigation will suspend until it resolves
      loader: simpleCache.createLoader(
        async () => {
          await sleep(300)
          return {
            root: Math.random(),
          }
        },
        {
          maxAge: 1000 * 10,
        }
      ),
      children: [
        { path: 'search-params', element: <SearchParams /> },
        {
          path: 'teams',
          element: <Teams />,
          errorElement: <LoaderError />,
          // pendingElement: 'Still Loading Teams...',
          // // Show pending element after 1 second
          // pendingMs: 1000,
          // // Show the pending element for at least 500ms
          // pendingMinMs: 1000,
          loader: simpleCache.createLoader(
            async () => {
              // Fail some of the time
              if (Math.random() > 0.9) {
                throw new Error('Status 500: Failed to load team data!')
              }
              // Soemtimes team data resolves fast, sometimtes slow...
              await sleep(Math.random() * 2000)
              // Child loaders merge their results on top of parent loaders
              return {
                teams: ['team-1', 'team-2', 'team-3'],
              }
            },
            {
              maxAge: 1000 * 10,
            }
          ),
          children: [
            {
              path: 'new',
              element: 'new',
            },
            {
              path: ':teamId',
              element: <Team />,
              // By default, loaders are parallized, but at any point in the route tree
              // you can await a parentLoader's promise to finish before proceeding
              loader: simpleCache.createLoader(
                async (match) => {
                  // Look ma! I can rely on parent route promise/data!
                  await match.parentMatch!.loaderPromise
                  if (!match.data.teams?.length) {
                  }
                  await sleep(300)
                  return {
                    teamId: Math.random(),
                  }
                },
                { maxAge: 1000 * 10 }
              ),
            },
          ],
        },
        {
          // In this route, the data and element are fetched in parallel
          // because the async element and loader are fetchable up front
          path: 'expensive',
          element: () => import('./Expensive').then((res) => <res.default />),
          loader: simpleCache.createLoader(
            async () => ({
              expensive: await new Promise((r) => setTimeout(r, 1000)).then(
                () => Math.random()
              ),
            }),
            { maxAge: 1000 * 10 }
          ),
        },
        {
          // In this route, the data can only be fetched after the entire route
          // module is imported, creating a momentary waterfall
          path: 'really-expensive',
          import: () => import('./ReallyExpensive').then((res) => res.route),
        },
      ],
    },
  ],
})

export function sleep(time: number) {
  return new Promise((r) => setTimeout(r, time))
}

const App = () => {
  return (
    <ReactLocationProvider location={location}>
      <router.Routes pendingElement="..." />
    </ReactLocationProvider>
  )
}

function LoaderError() {
  const route = router.useRoute()

  return (
    <div>
      <div>Oh no! Something happened when fetching data for this route!</div>
      <pre>{(route.error as Error).message}</pre>
    </div>
  )
}

function Home() {
  const route = router.useRoute()

  return (
    <div>
      <div>
        <router.Link to="/">
          <pre>/</pre>
        </router.Link>
        <router.Link to="/search-params">
          <pre>/search-params</pre>
        </router.Link>
        <router.Link to="/teams">
          <pre>/teams</pre>
        </router.Link>
        <router.Link to="/teams/team-2">
          <pre>/teams/team-2</pre>
        </router.Link>
        <router.Link to="/expensive">
          <pre>/expensive</pre>
        </router.Link>
        <router.Link to="/really-expensive">
          <pre>/really-expensive</pre>
        </router.Link>
        <router.Link to="/really-expensive/sub-expensive">
          <pre>/really-expensive/sub-expensive</pre>
        </router.Link>
      </div>
      <hr />
      Root Data: {JSON.stringify(route.data)}
      <hr />
      <router.Outlet />
    </div>
  )
}

function Teams() {
  const route = router.useRoute()

  return (
    <div>
      Teams Data: {JSON.stringify(route.data)}
      <hr />
      <div>
        <router.Link to="..">
          <pre>..</pre>
        </router.Link>
      </div>
      <div>
        <router.Link to="new">
          <pre>new</pre>
        </router.Link>
      </div>
      {route.data.teams?.map((team) => {
        return (
          <div key={team}>
            <router.Link to={team}>
              <pre>{team}</pre>
            </router.Link>
          </div>
        )
      })}
      <hr />
      <router.Outlet />
    </div>
  )
}

function Team() {
  const route = router.useRoute()

  return (
    <div>
      <div>TeamId: {route.params.teamId}</div>
      <div>Team Data: {JSON.stringify(route.data)}</div>
    </div>
  )
}

function SearchParams() {
  const search = router.useSearch()

  console.info(search)

  return (
    <>
      <router.Link<LocationGenerics>>
        <pre>{`(none)`}</pre>
      </router.Link>
      <router.Link<LocationGenerics> search={{ foo: true }}>
        <pre>{`search={{ foo: true }}`}</pre>
      </router.Link>
      <router.Link<LocationGenerics> search={(old) => ({ ...old, bar: 'bar' })}>
        <pre>{`search={old => ({ ...old, bar: 'bar' })}`}</pre>
      </router.Link>
      <router.Link<LocationGenerics>
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
      </router.Link>
    </>
  )
}

const rootElement = document.getElementById('root')
render(<App />, rootElement)
