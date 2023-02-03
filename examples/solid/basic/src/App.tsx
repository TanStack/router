import { Link, Router, RouterProvider } from '@tanstack/solid-router'
import { Component, createSignal } from 'solid-js'

const router = new SolidRouter()

const App: Component = () => {
  const color = (idx: number) =>
    ['bg-red-200', 'bg-blue-200', 'bg-green-200'].at(idx)
  const [colorIdx, setColorIdx] = createSignal(0)

  return (
    <>
      <RouterProvider router={router}>
        <button onClick={() => setColorIdx((colorIdx() + 1) % 3)}>
          change color
        </button>
        <div class="p-2 flex gap-2 text-lg">
          <Router>
            <Link
              to="/"
              class={color(colorIdx())}
              activeProps={{
                class: 'font-bold',
              }}
              activeOptions={{ exact: true }}
            >
              Home
            </Link>{' '}
            <Link
              to="/posts"
              activeProps={{
                class: 'font-bold',
              }}
            >
              Posts
            </Link>
          </Router>
        </div>

        <hr />
        {/* <Outlet /> */}
        {/* Start rendering router matches */}
        {/* <TanStackRouterDevtools position="bottom-right" /> */}
      </RouterProvider>
    </>
  )
}

export default App
