import * as React from 'react'
import { AnyRouter, RouterProvider } from '@tanstack/router'
import { Hydrate } from './components/Hydrate'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

// server$.addSerializer({
//   apply: (e) => e instanceof LoaderInstance,
//   serialize: (e) => ({ $type: 'loaderClient' }),
// })

export function StartClient(props: { router: AnyRouter }) {
  const CustomRouterProvider = props.router.options.Provider || React.Fragment

  return (
    <Hydrate router={props.router}>
      <CustomRouterProvider>
        <RouterProvider router={props.router} />
      </CustomRouterProvider>
    </Hydrate>
  )
}

export function Scripts() {
  const dehydrated = React.useContext(
    cprc.getContext('TanStackStartHydrationContext', {}),
  )

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
