import { ActionClientProvider } from '@tanstack/solid-actions'
import { LoaderClientProvider } from '@tanstack/solid-loaders'
import { RouterProvider } from '@tanstack/solid-router'

import { createContext, JSXElement, useContext } from 'solid-js'
import { createStore } from 'solid-js/store'
import { actionClient } from './actionClient'
import { loaderClient } from './loaderClient'
import { router } from './router'
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
      <div class="text-xs fixed w-52 shadow rounded bottom-2 left-2 bg-white bg-opacity-75 p-2 border-b flex flex-col gap-1 flex-wrap items-left">
        <div>Loader Delay: {loaderDelay()}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={loaderDelay()}
            onInput={(e) => setLoaderDelay(e.currentTarget.valueAsNumber)}
            class="w-full"
          />
        </div>

        <div>Action Delay: {actionDelay}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={actionDelay()}
            onInput={(e) => setActionDelay(e.currentTarget.valueAsNumber)}
            class="w-full"
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
            value={defaultLoaderMaxAge()}
            onInput={(e) =>
              setDefaultLoaderMaxAge(e.currentTarget.valueAsNumber)
            }
            class='w-full"'
          />
        </div>
      </div>
      <AuthProvider>
        <LoaderClientProvider
          loaderClient={loaderClient}
          defaultMaxAge={defaultLoaderMaxAge()}
        >
          <ActionClientProvider actionClient={actionClient}>
            <RouterProvider
              router={router}
              defaultLoaderMaxAge={defaultLoaderMaxAge()}
              // Normally, the options above aren't changing, but for this particular
              // example, we need to key the router when they change
            />
          </ActionClientProvider>
        </LoaderClientProvider>
      </AuthProvider>
    </>
  )
}

type AuthContextStore = {
  status: 'loggedOut' | 'loggedIn'
  username?: string
}

type AuthContextUtils = {
  login: (username: string) => void
  logout: () => void
}

const AuthContext = createContext<[AuthContextStore, AuthContextUtils]>(null!)

export function AuthProvider(props: { children: JSXElement }) {
  const [store, setStore] = createStore<AuthContextStore>({
    status: 'loggedOut',
  })

  const utils = {
    login(username: string) {
      setStore({ status: 'loggedIn', username })
    },
    logout() {
      setStore('status', 'loggedOut')
    },
  }

  return (
    <AuthContext.Provider value={[store, utils]}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const auth = useContext(AuthContext)

  if (!auth) {
    throw new Error('useAuth must be used under an auth context')
  }

  return auth!
}

export default App
