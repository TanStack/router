import * as React from 'react'
import { AnyRouter } from '@tanstack/router'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export type HydrationCtx = Record<string, any>

export function Hydrate(props: { router: AnyRouter; children: any }) {
  // Server hydrates from context
  let ctx = React.useContext(
    cprc.getContext('TanStackStartHydrationContext', {}),
  ) as HydrationCtx

  React.useState(() => {
    if (ctx) {
      props.router.hydrate(ctx)
    }
  })

  return props.children
}
