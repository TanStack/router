import { LoaderInstance } from '@tanstack/react-loaders'
import { AnyRouter, RouterProvider } from '@tanstack/router'
import { Hydrate, HydrationCtx } from './Hydrate'
import { server$ } from '@tanstack/bling/server'
import * as React from 'react'

server$.addSerializer({
  apply: (e) => e instanceof LoaderInstance,
  serialize: (e) => ({ $type: 'loaderClient' }),
})

export function StartClient(props: { router: AnyRouter }) {
  const CustomRouterProvider = props.router.options.Provider || React.Fragment

  return (
    <Hydrate onHydrate={props.router.options.hydrate}>
      <CustomRouterProvider>
        <RouterProvider router={props.router} />
      </CustomRouterProvider>
    </Hydrate>
  )
}
