import { Link, Outlet, createRootRoute } from '@tanstack/solid-router'
// import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    )
  },
})

function RootComponent() {
  return (
    <>
      <div class="p-2 flex gap-2 text-lg border-b">
        <Link
          to="/"
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
        </Link>{' '}
        <Link
          to="/layout-a"
          activeProps={{
            class: 'font-bold',
          }}
        >
          Layout
        </Link>{' '}
        <Link
          to="/without-loader"
          activeProps={{
            class: 'font-bold',
          }}
        >
          without-loader
        </Link>{' '}
        <Link
          // @ts-expect-error
          to="/this-route-does-not-exist"
          activeProps={{
            class: 'font-bold',
          }}
        >
          This Route Does Not Exist
        </Link>
      </div>
      <hr />
      <div style={{ height: '200vh' }} />
      <Link
        preload="viewport"
        to="/viewport-test"
        activeProps={{
          class: 'font-bold',
        }}
      >
        viewport-test
      </Link>
      <Outlet />
      {/* Start rendering router matches */}
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  )
}
