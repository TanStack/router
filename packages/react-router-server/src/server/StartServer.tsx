import { Context } from '@tanstack/react-cross-context'
import {
  Matches,
  RouterContextProvider,
  rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { StartClient } from '../client'
import type { RootRouteOptions } from '../../../react-router/dist/esm/route'
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

  const ShellComponent = (
    props.router.looseRoutesById[rootRouteId]?.options as RootRouteOptions
  ).shellComponent

  return (
    // Provide the hydration context still, since `<DehydrateRouter />` needs it.
    <hydrationContext.Provider value={hydrationCtxValue}>
      {/* We also render the shell here */}
      <RouterContextProvider router={props.router}>
        {ShellComponent ? (
          <ShellComponent>
            <div id="root">
              <StartClient router={props.router} />
            </div>
          </ShellComponent>
        ) : (
          <Matches />
        )}
      </RouterContextProvider>
    </hydrationContext.Provider>
  )
}
