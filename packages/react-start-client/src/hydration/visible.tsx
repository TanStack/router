'use client'

import * as React from 'react'

import { reactUse } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { hydrateIdAttribute } from '@tanstack/start-client-core/hydration/constants'
import type {
  HydrationPrefetchStrategy,
  VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration'
import type {
  HydrateProps,
  InternalHydrateProps,
  ReactHydrationStrategy,
} from '../Hydrate'

const visibleType = 'visible'

type VisibleGate = {
  promise: Promise<void>
  resolved: boolean
  resolve: () => void
}

function observeVisible(
  element: Element | null,
  callback: () => void,
  rootMargin: string,
  threshold: number | Array<number>,
) {
  if (!element || typeof IntersectionObserver !== 'function') {
    callback()
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      callback()
    },
    { rootMargin, threshold },
  )
  observer.observe(element)
  return () => observer.disconnect()
}

function createGate() {
  let resolvePromise!: () => void
  const gate: VisibleGate = {
    promise: new Promise<void>((resolve) => {
      resolvePromise = resolve
    }),
    resolved: false,
    resolve: () => {
      if (gate.resolved) return
      gate.resolved = true
      resolvePromise()
    },
  }
  return gate
}

function HydrationGate(props: {
  gate: VisibleGate
  children: React.ReactNode
}) {
  if (props.gate.resolved) return props.children as React.JSX.Element

  if (reactUse) {
    reactUse(props.gate.promise)
    return props.children as React.JSX.Element
  }

  throw props.gate.promise
}

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

export function StrategyHydrate(props: HydrateProps): React.JSX.Element {
  const internalProps = props as InternalHydrateProps
  const reactId = React.useId()
  const id = internalProps.splitId
    ? `${internalProps.splitId}${reactId}`
    : reactId
  const strategy = internalProps.when
  const prefetchStrategy = internalProps.prefetch
  const preload = internalProps.preload
  const markerRef = React.useRef<HTMLDivElement | null>(null)
  const didPrefetchRef = React.useRef(false)
  const gateRef = React.useRef<VisibleGate | undefined>(undefined)

  if (!gateRef.current) {
    gateRef.current = createGate()
    if ((isServer as boolean | undefined) ?? typeof window === 'undefined') {
      gateRef.current.resolve()
    }
  }

  React.useEffect(() => {
    if (!preload || !prefetchStrategy || didPrefetchRef.current) return

    const prefetch = () => {
      if (didPrefetchRef.current) return
      didPrefetchRef.current = true
      void preload()
    }

    const cleanup = prefetchStrategy.setupPrefetch?.({
      element: markerRef.current,
      prefetch,
    })
    if (typeof cleanup === 'function') return cleanup
    return undefined
  }, [prefetchStrategy, preload])

  React.useEffect(() => {
    const gate = gateRef.current!
    if (gate.resolved) return

    const cleanup = strategy.setup?.({
      element: markerRef.current,
      gate: gate as any,
    })
    if (typeof cleanup === 'function') return cleanup
    return undefined
  }, [strategy])

  return (
    <div
      ref={markerRef}
      {...{
        [hydrateIdAttribute]: id,
      }}
    >
      <React.Suspense fallback={props.fallback ?? null}>
        <HydrationGate gate={gateRef.current}>
          <HydratedBoundary
            id={id}
            onHydrated={props.onHydrated}
            onStrategyHydrated={strategy.onHydrated}
          >
            {props.children}
          </HydratedBoundary>
        </HydrationGate>
      </React.Suspense>
    </div>
  )
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options?: VisibleHydrationOptions,
): ReactHydrationStrategy & HydrationPrefetchStrategy {
  const rootMargin = options?.rootMargin ?? '600px'
  const threshold = options?.threshold ?? 0

  return {
    type: visibleType,
    key: visibleType,
    setup: ({ element, gate }: any) =>
      observeVisible(element, gate.resolve, rootMargin, threshold),
    setupPrefetch: ({ element, prefetch }: any) =>
      observeVisible(element, prefetch, rootMargin, threshold),
    $$renderHydrate: StrategyHydrate,
  }
}
