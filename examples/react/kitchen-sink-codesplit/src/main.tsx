import React from 'react'
import ReactDOM from 'react-dom/client'
import { Outlet, RouterProvider } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { router } from './router'
import { Spinner } from './components/Spinner'
import { useSessionStorage } from './utils'

function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [loaderDelay, setLoaderDelay] = useSessionStorage('loaderDelay', 500)
  const [actionDelay, setActionDelay] = useSessionStorage('actionDelay', 500)

  const [defaultLoaderMaxAge, setDefaultLoaderMaxAge] = useSessionStorage(
    'defaultLoaderMaxAge',
    5000,
  )
  const [defaultPreloadMaxAge, setDefaultPreloadMaxAge] = useSessionStorage(
    'defaultPreloadMaxAge',
    2000,
  )

  const PendingComponent = React.useCallback(
    () => (
      <div className={`p-2 text-2xl`}>
        <Spinner />
      </div>
    ),
    [],
  )

  return (
    <>
      {/* More stuff to tweak our sandbox setup in real-time */}
      <div className="text-xs fixed w-52 shadow rounded bottom-2 left-2 bg-white bg-opacity-75 p-2 border-b flex flex-col gap-1 flex-wrap items-left">
        <div>Loader Delay: {loaderDelay}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={loaderDelay}
            onChange={(e) => setLoaderDelay(e.target.valueAsNumber)}
            className="w-full"
          />
        </div>

        <div>Action Delay: {actionDelay}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={actionDelay}
            onChange={(e) => setActionDelay(e.target.valueAsNumber)}
            className="w-full"
          />
        </div>
        <div>
          Loader Max Age:{' '}
          {defaultLoaderMaxAge ? `${defaultLoaderMaxAge}ms` : 'Off'}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="10000"
            step="250"
            value={defaultLoaderMaxAge}
            onChange={(e) => setDefaultLoaderMaxAge(e.target.valueAsNumber)}
            className={`w-full`}
          />
        </div>
        <div>
          Preload Max Age:{' '}
          {defaultPreloadMaxAge ? `${defaultPreloadMaxAge}ms` : 'Off'}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="10000"
            step="250"
            value={defaultPreloadMaxAge}
            onChange={(e) => setDefaultPreloadMaxAge(e.target.valueAsNumber)}
            className={`w-full`}
          />
        </div>
      </div>
      <AuthProvider>
        <RouterProvider
          router={router}
          defaultPendingComponent={PendingComponent}
          defaultLoaderMaxAge={defaultLoaderMaxAge}
          defaultPreloadMaxAge={defaultPreloadMaxAge}
          // Normally, the options above aren't changing, but for this particular
          // example, we need to key the router when they change
          key={[defaultPreloadMaxAge].join('.')}
        >
          {/* Normally <Router /> acts as it's own outlet,
            but if we pass it children, route matching is
            deferred until the first <Outlet /> is found. */}
          <Root />
        </RouterProvider>
      </AuthProvider>
      <TanStackRouterDevtools router={router} position="bottom-right" />
    </>
  )
}

function Root() {
  const routerState = router.useState()

  return (
    <div className={`min-h-screen flex flex-col`}>
      <div className={`flex items-center border-b gap-2`}>
        <h1 className={`text-3xl p-2`}>Kitchen Sink</h1>
        {/* Show a global spinner when the router is transitioning */}
        <div
          className={`text-3xl duration-300 delay-0 opacity-0 ${
            routerState.status === 'loading' || routerState.isFetching
              ? ` duration-1000 opacity-40`
              : ''
          }`}
        >
          <Spinner />
        </div>
      </div>
      <div className={`flex-1 flex`}>
        <div className={`divide-y w-56`}>
          {(
            [
              ['.', 'Home'],
              ['/dashboard', 'Dashboard'],
              ['/expensive', 'Expensive'],
              ['/authenticated', 'Authenticated'],
              ['/layout-a', 'Layout A'],
              ['/layout-b', 'Layout B'],
            ] as const
          ).map(([to, label]) => {
            return (
              <div key={to}>
                <router.Link
                  to={to}
                  activeOptions={
                    {
                      // If the route points to the root of it's parent,
                      // make sure it's only active if it's exact
                      // exact: to === '.',
                    }
                  }
                  className={`block py-2 px-3 text-blue-700`}
                  // Make "active" links bold
                  activeProps={{ className: `font-bold` }}
                >
                  {label}
                </router.Link>
              </div>
            )
          })}
        </div>
        <div className={`flex-1 border-l border-gray-200`}>
          {/* Render our first route match */}
          <Outlet />
        </div>
      </div>
    </div>
  )
}

type AuthContext = {
  login: (username: string) => void
  logout: () => void
} & AuthContextState

type AuthContextState = {
  status: 'loggedOut' | 'loggedIn'
  username?: string
}

const AuthContext = React.createContext<AuthContext>(null!)

export function AuthProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthContextState>({
    status: 'loggedOut',
  })

  const login = (username: string) => {
    setState({ status: 'loggedIn', username })
  }

  const logout = () => {
    setState({ status: 'loggedOut' })
  }

  const contextValue = React.useMemo(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state],
  )

  return <AuthContext.Provider value={contextValue} children={props.children} />
}

export function useAuth() {
  return React.useContext(AuthContext)
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<App />)
}
