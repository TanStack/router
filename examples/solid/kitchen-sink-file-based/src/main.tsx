import * as React from 'solid-js'
import {
  ErrorComponent,
  RouterProvider,
  createRouter,
} from '@tanstack/solid-router'
import { auth } from './utils/auth'
import { Spinner } from './components/Spinner'
import { routeTree } from './routeTree.gen'
import { useSessionStorage } from './hooks/useSessionStorage'
import './styles.css'
import { render } from 'solid-js/web'

//

const router = createRouter({
  routeTree,
  defaultPendingComponent: () => (
    <div class={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
  defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
  context: {
    auth: undefined!, // We'll inject this when we render
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [loaderDelay, setLoaderDelay] = useSessionStorage<number>(
    'loaderDelay',
    500,
  )
  const [pendingMs, setPendingMs] = useSessionStorage<number>('pendingMs', 1000)
  const [pendingMinMs, setPendingMinMs] = useSessionStorage<number>(
    'pendingMinMs',
    500,
  )

  return (
    <>
      <div class="text-xs fixed w-52 shadow-md shadow-black/20 rounded bottom-2 left-2 bg-white dark:bg-gray-800 bg-opacity-75 border-b flex flex-col gap-1 flex-wrap items-left divide-y">
        <div class="p-2 space-y-2">
          <div class="flex gap-2">
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setLoaderDelay(150)
              }}
            >
              Fast
            </button>
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setLoaderDelay(500)
              }}
            >
              Fast 3G
            </button>
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setLoaderDelay(2000)
              }}
            >
              Slow 3G
            </button>
          </div>
          <div>
            <div>Loader Delay: {loaderDelay()}ms</div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={loaderDelay()}
              onChange={(e) => setLoaderDelay(e.target.valueAsNumber)}
              class="w-full"
            />
          </div>
        </div>
        <div class="p-2 space-y-2">
          <div class="flex gap-2">
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setPendingMs(1000)
                setPendingMinMs(500)
              }}
            >
              Reset to Default
            </button>
          </div>
          <div>
            <div>defaultPendingMs: {pendingMs()}ms</div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={pendingMs()}
              onChange={(e) => setPendingMs(e.target.valueAsNumber)}
              class="w-full"
            />
          </div>
          <div>
            <div>defaultPendingMinMs: {pendingMinMs()}ms</div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={pendingMinMs()}
              onChange={(e) => setPendingMinMs(e.target.valueAsNumber)}
              class="w-full"
            />
          </div>
        </div>
      </div>
      <RouterProvider
        router={router}
        defaultPreload="intent"
        defaultPendingMs={pendingMs()}
        defaultPendingMinMs={pendingMinMs()}
        context={{
          auth,
        }}
      />
    </>
  )
}

const rootElement = document.getElementById('app')!
render(() => <App />, rootElement!)
