'use client'

import * as React from 'react'

import { load as coreLoad } from '@tanstack/start-client-core/hydration'
import {
  hydrateIdAttribute,
  hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants'
import type {
  HydrateProps,
  InternalHydrateProps,
  ReactHydrationStrategy,
} from '../Hydrate'

const loadType = 'load'

function HydratedBoundary(props: {
  id: string
  onHydrated?: () => void
  onStrategyHydrated?: (id: string) => void
  children: React.ReactNode
}) {
  const { id, onHydrated, onStrategyHydrated, children } = props
  const didHydrateRef = React.useRef(false)

  React.useEffect(() => {
    if (didHydrateRef.current) return
    didHydrateRef.current = true
    onHydrated?.()
    onStrategyHydrated?.(id)
  }, [id, onHydrated, onStrategyHydrated])

  return children as React.JSX.Element
}

export function LoadHydrate(props: HydrateProps): React.JSX.Element {
  const internalProps = props as InternalHydrateProps
  const reactId = React.useId()
  const id = internalProps.splitId
    ? `${internalProps.splitId}${reactId}`
    : reactId

  return (
    <div
      {...{
        [hydrateIdAttribute]: id,
        [hydrateWhenAttribute]: loadType,
      }}
    >
      <React.Suspense fallback={props.fallback ?? null}>
        <HydratedBoundary
          id={id}
          onHydrated={props.onHydrated}
          onStrategyHydrated={internalProps.when.onHydrated}
        >
          {props.children}
        </HydratedBoundary>
      </React.Suspense>
    </div>
  )
}

/* @__NO_SIDE_EFFECTS__ */
export function load(): ReactHydrationStrategy {
  return /* @__PURE__ */ Object.assign(coreLoad(), {
    $$renderHydrate: LoadHydrate,
  })
}
