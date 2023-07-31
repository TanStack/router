import * as React from 'react'
import { AnyRouter, RouterProvider } from '@tanstack/router'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export function StartClient(props: { router: AnyRouter }) {
  return <RouterProvider router={props.router} />
}

export function DehydrateRouter() {
  const dehydrated = React.useContext(
    cprc.getContext('TanStackRouterHydrationContext', {}),
  )

  console.log(
    '[dehydrate router]: dehydrated context',
    JSON.stringify(dehydrated, null, 4),
  )

  return (
    <script
      id="__TSR_DEHYDRATED__"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `
          window.__TSR_DEHYDRATED__ = ${JSON.stringify(dehydrated)}
        `,
      }}
    />
  )
}
