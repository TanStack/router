import { Context } from '@tanstack/react-cross-context'
import {
  Matches,
  RouterContextProvider,
  rootRouteId,
} from '@tanstack/react-router'
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

  const Shell =
    props.router.looseRoutesById[rootRouteId]?.options.staticData?.Shell

  return (
    // Provide the hydration context still, since `<DehydrateRouter />` needs it.
    <hydrationContext.Provider value={hydrationCtxValue}>
      {/* We also render the shell here */}
      <RouterContextProvider router={props.router}>
        {Shell ? (
          <Shell>
            <div id="root">
              <Matches />
            </div>
          </Shell>
        ) : (
          <Matches />
        )}
      </RouterContextProvider>
    </hydrationContext.Provider>
  )
}
