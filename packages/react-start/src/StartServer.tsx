import { AnyRouter, RouterProvider } from '@tanstack/router'
import { Hydrate, HydrationCtx, hydrationContext } from './Hydrate'
// import { server$ } from '@tanstack/bling/server'
import * as React from 'react'

// server$.addDeserializer({
//   apply: (e) => e.$type === 'loaderClient',
//   deserialize: (e, event) => event.locals.$loaderClient,
// })

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const CustomRouterProvider = props.router.options.Provider || React.Fragment

  return (
    <hydrationContext.Provider value={props.router.options.dehydrate?.()}>
      <Hydrate onHydrate={props.router.options.hydrate}>
        <CustomRouterProvider>
          <RouterProvider router={props.router} />
        </CustomRouterProvider>
      </Hydrate>
    </hydrationContext.Provider>
  )
}
