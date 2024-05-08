import { Context } from '@tanstack/react-cross-context'
import {
  Matches,
  RouterContextProvider,
  rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { ClientMeta } from '../client'
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

  const client = (
    <>
      {ShellComponent ? <ClientMeta /> : null}
      <Matches />
    </>
  )

  const shell = ShellComponent ? (
    <ShellComponent>
      <div id="root">{client}</div>
    </ShellComponent>
  ) : (
    client
  )

  return (
    <hydrationContext.Provider value={hydrationCtxValue}>
      <RouterContextProvider router={props.router}>
        {shell}
      </RouterContextProvider>
    </hydrationContext.Provider>
  )
}
