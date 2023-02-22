import * as React from 'react'
import { invariant } from '@tanstack/router'

export type HydrationCtx = Record<string, any>

declare global {
  interface Window {
    __DEHYDRATED__?: HydrationCtx
  }
}

export const hydrationContext = React.createContext<HydrationCtx>({} as any)

export function Hydrate(props: {
  onHydrate?: (ctx: HydrationCtx) => void
  children: any
}) {
  // Server hydrates from context
  let ctx = React.useContext(hydrationContext)

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
