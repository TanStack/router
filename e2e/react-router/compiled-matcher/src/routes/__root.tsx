import {
  HeadContent,
  Link,
  Outlet,
  createRootRoute,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

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
  return (
    <>
      <HeadContent />
      <div className="flex flex-col gap-2 p-2 text-lg border-b">
        {Object.keys(router.routesByPath).map((to) => (
          <Link
            to={to}
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            {to}
          </Link>
        ))}
      </div>
      <hr />
      <Outlet />
      {/* Start rendering router matches */}
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
