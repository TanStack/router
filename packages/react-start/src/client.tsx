import * as React from 'react'
import { AnyRouter, RouterProvider, useRouter } from '@tanstack/react-router'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export function StartClient(props: { router: AnyRouter }) {
  return <RouterProvider router={props.router} />
}

export function DehydrateRouter() {
  const router = useRouter()

  const dehydratedCtx = React.useContext(
    cprc.getContext('TanStackRouterHydrationContext', {}),
  )

  const dehydrated = router.dehydratedData || dehydratedCtx

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
