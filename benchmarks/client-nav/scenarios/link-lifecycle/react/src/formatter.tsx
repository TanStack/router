import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import type { FormatterOptions } from '../../shared'
import type { RouterHistory } from '@tanstack/history'
import type { SearchSchemaInput } from '@tanstack/react-router'

const rootRoute = createRootRouteWithContext<FormatterOptions>()({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    page: typeof search.page === 'number' ? search.page : 0,
  }),
  component: FormatterLayout,
})
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/format' }),
  createRoute({ getParentRoute: () => rootRoute, path: '/targets/$id' }),
])

function FormatterLayout() {
  const { externalCount, internalCount } = rootRoute.useRouteContext()
  return (
    <main>
      <nav>
        {(['first', 'second'] as const).map((name, index) => (
          <Link
            key={name}
            to="/format"
            search={{ page: index }}
            activeOptions={{ exact: true }}
            replace
            data-testid={`format-${name}`}
          >
            {name}
          </Link>
        ))}
      </nav>
      {Array.from({ length: externalCount + internalCount }, (_, index) =>
        index < externalCount ? (
          <Link
            key={index}
            to={`https://external.example/item-${index}`}
            data-formatter-link={index}
          >
            External {index}
          </Link>
        ) : (
          <Link
            key={index}
            to="/targets/$id"
            params={{ id: `item-${index - externalCount}` }}
            data-formatter-link={index}
          >
            Internal {index - externalCount}
          </Link>
        ),
      )}
      <Outlet />
    </main>
  )
}

export function mountFormatterApp(
  container: HTMLElement,
  history: RouterHistory,
  options: FormatterOptions,
) {
  const router = createRouter({
    routeTree,
    history,
    context: options,
    defaultPreload: false,
    defaultStaleTime: 0,
    scrollRestoration: false,
  })
  const root = createRoot(container)
  root.render(<RouterProvider router={router} />)
  return { router, unmount: () => root.unmount() }
}
