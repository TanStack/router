import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { LoaderClientProvider } from '@tanstack/react-loaders'
import { ActionClientProvider } from '@tanstack/react-actions'

import { router } from './router'
import { loaderClient } from './loaderClient'
import { actionClient } from './actionClient'
import { useSessionStorage } from './utils'

function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [loaderDelay, setLoaderDelay] = useSessionStorage('loaderDelay', 500)
  const [actionDelay, setActionDelay] = useSessionStorage('actionDelay', 500)

  const [defaultLoaderMaxAge, setDefaultLoaderMaxAge] = useSessionStorage(
    'defaultLoaderMaxAge',
    0,
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
      </div>
      <AuthProvider>
        <LoaderClientProvider
          loaderClient={loaderClient}
          defaultMaxAge={defaultLoaderMaxAge}
        >
          <ActionClientProvider actionClient={actionClient}>
            <RouterProvider router={router} />
          </ActionClientProvider>
        </LoaderClientProvider>
      </AuthProvider>
    </>
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
