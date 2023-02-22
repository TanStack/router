import * as React from 'react'
import { LoaderInstance } from '@tanstack/react-loaders'
import { AnyRouter, RouterProvider } from '@tanstack/router'
import { server$ } from '@tanstack/bling/client'
import { hydrationContext } from './components/Hydrate'
import { Hydrate } from './components/Hydrate'

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

export function Scripts() {
  const dehydrated = React.useContext(hydrationContext)

  return (
    <>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `
          window.__DEHYDRATED__ = 
           ${
             JSON.stringify(dehydrated)
             // {
             //   isScriptContext: true,
             //   quotes: 'single',
             //   json: true,
             // },
           }
        `,
        }}
      />
      <script type="module" src="/src/app/entry-client.tsx" />
    </>
  )
}
