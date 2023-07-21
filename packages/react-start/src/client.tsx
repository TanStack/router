import * as React from 'react'
import { AnyRouter, RouterProvider } from '@tanstack/router'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export function StartClient(props: { router: AnyRouter }) {
  const CustomRouterProvider = props.router.options.Wrap || React.Fragment

  return (
    <CustomRouterProvider>
      <RouterProvider router={props.router} />
    </CustomRouterProvider>
  )
}

export function RouterScripts() {
  const dehydrated = React.useContext(
    cprc.getContext('TanStackRouterHydrationContext', {}),
  )

  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `
          window.__TSR_DEHYDRATED__ = ${JSON.stringify(dehydrated)}
        `,
      }}
    />
  )
}
