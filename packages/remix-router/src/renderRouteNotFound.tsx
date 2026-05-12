/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { DefaultGlobalNotFound } from './not-found'
import type { RemixNode } from '@remix-run/ui'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'

/**
 * Resolve a `notFoundComponent` for a route, falling back to the router's
 * `defaultNotFoundComponent` and finally to a built-in `<p>Not Found</p>`.
 */
export function renderRouteNotFound(
  router: AnyRouter,
  route: AnyRoute,
  data: any,
): RemixNode {
  if (!route.options.notFoundComponent) {
    if (router.options.defaultNotFoundComponent) {
      const Comp = router.options.defaultNotFoundComponent as any
      return <Comp {...data} />
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `Warning: A notFoundError was encountered on route "${route.id}", but no notFoundComponent / defaultNotFoundComponent is configured.`,
      )
    }
    const Default = DefaultGlobalNotFound as any
    return <Default />
  }

  const Comp = route.options.notFoundComponent as any
  return <Comp {...data} />
}
