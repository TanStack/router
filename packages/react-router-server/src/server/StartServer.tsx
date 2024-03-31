import { Context } from '@tanstack/react-cross-context'
import { RouterProvider } from '@tanstack/react-router'
import * as React from 'react'
import type { AnyRouter } from '@tanstack/react-router'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const hydrationContext = Context.get('TanStackRouterHydrationContext', {})

  const hydrationCtxValue = React.useMemo(
    () => ({
      router: props.router.dehydrate(),
      payload: props.router.options.dehydrate?.(),
    }),
    [props.router],
  )

  return (
    // Provide the hydration context still, since `<DehydrateRouter />` needs it.
    <hydrationContext.Provider value={hydrationCtxValue}>
      <RouterProvider router={props.router} />
    </hydrationContext.Provider>
  )
}
