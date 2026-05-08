'use client'

import * as React from 'react'

import {
  hydrateIdAttribute,
  hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants'
import type {
  HydrationPrefetchStrategy,
  HydrationRuntimeContext,
} from '@tanstack/start-client-core/hydration'
import type {
  HydrateProps,
  InternalHydrateProps,
  ReactHydrationStrategy,
} from '../Hydrate'

const loadType = 'load'

function HydratedBoundary(props: {
  onHydrated?: () => void
  children: React.ReactNode
}) {
  const { onHydrated, children } = props
  const didHydrateRef = React.useRef(false)

  React.useEffect(() => {
    if (didHydrateRef.current) return
    didHydrateRef.current = true
    onHydrated?.()
  }, [onHydrated])

  return children as React.JSX.Element
}

export function LoadHydrate(props: HydrateProps): React.JSX.Element {
  const internalProps = props as InternalHydrateProps
  const reactId = React.useId()
  const id = internalProps.h ? `${internalProps.h}${reactId}` : reactId

  return (
    <div
      {...{
        [hydrateIdAttribute]: id,
        [hydrateWhenAttribute]: loadType,
      }}
    >
      <React.Suspense fallback={props.fallback ?? null}>
        <HydratedBoundary onHydrated={props.onHydrated}>
          {props.children}
        </HydratedBoundary>
      </React.Suspense>
    </div>
  )
}

const loadStrategy = {
  _s: ({ gate, prefetch }: HydrationRuntimeContext) => {
    ;(prefetch ?? gate!.resolve)()
  },
  _h: LoadHydrate,
} as ReactHydrationStrategy<'load', true> & HydrationPrefetchStrategy<'load'>

/* @__NO_SIDE_EFFECTS__ */
export function load(): ReactHydrationStrategy<'load', true> &
  HydrationPrefetchStrategy<'load'> {
  return loadStrategy
}
