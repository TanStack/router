import * as React from 'react'
import { invariant } from '@tanstack/router'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export type HydrationCtx = Record<string, any>

declare global {
  interface Window {
    __DEHYDRATED__?: HydrationCtx
  }
}

export function Hydrate(props: {
  onHydrate?: (ctx: HydrationCtx) => void
  children: any
}) {
  // Server hydrates from context
  let ctx = React.useContext(
    cprc.getContext('TanStackStartHydrationContext', {}),
  ) as HydrationCtx

  React.useState(() => {
    // Client hydrates from window
    if (typeof document !== 'undefined') {
      ctx = window.__DEHYDRATED__ as HydrationCtx

      invariant(
        ctx,
        'Expected to find a __DEHYDRATED__ property on window... but we did not. THIS IS VERY BAD',
      )
    }

    props.onHydrate?.(ctx)
  })

  return props.children
}
