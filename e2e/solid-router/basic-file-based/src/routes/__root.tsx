import {
  Link,
  Outlet,
  createRootRoute,
  useCanGoBack,
  useRouter,
} from '@tanstack/solid-router'
// // import { TanStackRouterDevtools } from '@tanstack/router-devtools'

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
  const router = useRouter()
  const canGoBack = useCanGoBack()

  return (
    <>
      <div class="flex gap-2 p-2 text-lg border-b">
        <button
          data-testid="back-button"
          disabled={!canGoBack()}
          onClick={() => router.history.back()}
          class={!canGoBack() ? 'line-through' : undefined}
        >
          Back
        </button>{' '}
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
          to="/onlyrouteinside"
          data-testid="link-to-only-route-inside-group"
          search={{ hello: 'world' }}
          activeProps={{
            class: 'font-bold',
          }}
        >
          Only Route Inside Group
        </Link>{' '}
        <Link
          to="/inside"
          data-testid="link-to-route-inside-group"
          search={{ hello: 'world' }}
          activeProps={{
            class: 'font-bold',
          }}
        >
          Inside Group
        </Link>{' '}
        <Link
          to="/subfolder/inside"
          data-testid="link-to-route-inside-group-inside-subfolder"
          search={{ hello: 'world' }}
          activeProps={{
            class: 'font-bold',
          }}
        >
          Inside Subfolder Inside Group
        </Link>{' '}
        <Link
          to="/insidelayout"
          data-testid="link-to-route-inside-group-inside-layout"
          search={{ hello: 'world' }}
          activeProps={{
            class: 'font-bold',
          }}
        >
          Inside Group Inside Layout
        </Link>{' '}
        <Link
          to="/lazyinside"
          data-testid="link-to-lazy-route-inside-group"
          search={{ hello: 'world' }}
          activeProps={{
            class: 'font-bold',
          }}
        >
          Lazy Inside Group
        </Link>{' '}
        <Link
          to="/redirect"
          activeProps={{
            class: 'font-bold',
          }}
        >
          redirect
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
      <Outlet />
      {/* Start rendering router matches */}
      {/* {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  )
}
