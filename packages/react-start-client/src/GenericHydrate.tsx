'use client'

import * as React from 'react'

import { reactUse, useHydrated } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import {
  hydrateIdAttribute,
  hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants'
import {
  createResolvedGate,
  getFallbackHtml,
  getOrCreateGate,
  onGateResolve,
  releaseGate,
  saveFallbackHtml,
} from '@tanstack/start-client-core/hydration/runtime'
import type { HydrationRuntimeContext } from '@tanstack/start-client-core/hydration'
import type { HydrationGateRecord } from '@tanstack/start-client-core/hydration/runtime'
import type { HydrateProps, InternalHydrateProps } from './Hydrate'

type Gate = HydrationGateRecord & { promise: Promise<void> }

function shouldDeferHydration(strategy: InternalHydrateProps['when']) {
  return strategy.shouldDefer
    ? strategy.shouldDefer()
    : strategy.type !== 'load'
}

function useLatest<T>(value: T) {
  const ref = React.useRef(value)
  ref.current = value
  return ref
}

function runStrategyCleanup(cleanup: void | (() => void)) {
  if (typeof cleanup === 'function') return cleanup
  return undefined
}

function useHydrationGate(props: InternalHydrateProps) {
  const hydrated = useHydrated()
  const reactId = React.useId()
  const id = props.splitId ? `${props.splitId}${reactId}` : reactId
  const hydrateStrategy = props.when
  const latestRef = useLatest({
    hydrateStrategy,
    prefetch: props.prefetch,
    delegated: props.__hydrate,
    preload: props.preload,
  })
  const gateRef = React.useRef<HydrationGateRecord | undefined>(undefined)
  const markerElementRef = React.useRef<HTMLDivElement | null>(null)
  const shouldPreserveServerHTMLRef = React.useRef<boolean | undefined>(
    undefined,
  )
  const shouldDeferInitialHydrationRef = React.useRef<boolean | undefined>(
    undefined,
  )
  const didPrefetchRef = React.useRef(false)

  shouldPreserveServerHTMLRef.current ??=
    ((isServer as boolean | undefined) ?? typeof window === 'undefined') ||
    !hydrated
  shouldDeferInitialHydrationRef.current ??=
    !hydrated && shouldDeferHydration(hydrateStrategy)

  if (!gateRef.current) {
    gateRef.current =
      ((isServer as boolean | undefined) ?? typeof window === 'undefined')
        ? createResolvedGate(id, hydrateStrategy.type)
        : getOrCreateGate(id, hydrateStrategy.type)
  }

  gateRef.current.when = hydrateStrategy.type

  if (
    !((isServer as boolean | undefined) ?? typeof window === 'undefined') &&
    hydrateStrategy.type !== 'never' &&
    (!shouldDeferInitialHydrationRef.current ||
      !shouldDeferHydration(hydrateStrategy))
  ) {
    gateRef.current.resolve()
  }

  const markerRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      markerElementRef.current = element
      if (element) {
        if (
          latestRef.current.hydrateStrategy.type === 'never' &&
          !shouldPreserveServerHTMLRef.current
        ) {
          element.replaceChildren()
        }
        saveFallbackHtml(id, element)
      }
    },
    [id, latestRef],
  )

  React.useEffect(() => {
    const gate = gateRef.current!
    return () => {
      releaseGate(gate)
    }
  }, [])

  React.useEffect(() => {
    if (
      ((isServer as boolean | undefined) ?? typeof window === 'undefined') ||
      !latestRef.current.preload ||
      !latestRef.current.prefetch ||
      didPrefetchRef.current
    ) {
      return
    }

    const prefetch = () => {
      if (didPrefetchRef.current) return
      didPrefetchRef.current = true
      void latestRef.current.preload?.()
    }

    return runStrategyCleanup(
      latestRef.current.prefetch.setupPrefetch?.({
        element: markerElementRef.current,
        prefetch,
      }),
    )
  }, [latestRef, props.prefetch?.key, props.preload])

  React.useEffect(() => {
    const gate = gateRef.current!
    const { hydrateStrategy, delegated: delegatedStrategy } = latestRef.current
    if (
      gate.resolved ||
      !shouldDeferInitialHydrationRef.current ||
      hydrateStrategy.type === 'never'
    ) {
      return
    }

    const cleanups: Array<() => void> = []
    let removeResolveListener = () => {}
    let disposed = false

    const cleanup = () => {
      if (disposed) return
      disposed = true
      removeResolveListener()
      cleanups.splice(0).forEach((fn) => fn())
    }

    const addCleanup = (fn: void | (() => void)) => {
      if (!fn) return
      if (disposed || gate.resolved) {
        fn()
        return
      }
      cleanups.push(fn)
    }

    removeResolveListener = onGateResolve(gate, cleanup)

    const context: HydrationRuntimeContext = {
      element: markerElementRef.current,
      gate,
    }
    addCleanup(runStrategyCleanup(hydrateStrategy.setup?.(context)))

    if (delegatedStrategy?.setup) {
      addCleanup(
        runStrategyCleanup(
          delegatedStrategy.setup({
            ...context,
            delegated: true,
          }),
        ),
      )
    }

    return cleanup
  }, [latestRef, props.__hydrate?.key, props.when.key])

  return {
    gate: gateRef.current,
    markerRef,
    hydrateStrategy,
    shouldPreserveServerHTML: shouldPreserveServerHTMLRef.current,
  }
}

function HydrationGate(props: { gate: Gate; children: React.ReactNode }) {
  if ((isServer as boolean | undefined) ?? typeof window === 'undefined') {
    return props.children as React.JSX.Element
  }

  if (props.gate.resolved) {
    return props.children as React.JSX.Element
  }

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
  const { id, onHydrated, onStrategyHydrated } = props
  const didHydrateRef = React.useRef(false)

  React.useEffect(() => {
    if (didHydrateRef.current) return
    didHydrateRef.current = true
    onHydrated?.()
    onStrategyHydrated?.(id)
  }, [id, onHydrated, onStrategyHydrated])

  return props.children as React.JSX.Element
}

function HydrationFallback(props: { id: string }) {
  const html = getFallbackHtml(props.id)

  if (!html) return null

  return (
    <div
      style={{ display: 'contents' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function GenericHydrate(props: HydrateProps): React.JSX.Element {
  const internalProps = props as InternalHydrateProps
  const { gate, hydrateStrategy, markerRef, shouldPreserveServerHTML } =
    useHydrationGate(internalProps)
  const fallback = shouldPreserveServerHTML ? (
    <HydrationFallback id={gate.id} />
  ) : (
    (props.fallback ?? null)
  )
  const markerAttributes = hydrateStrategy.getMarkerAttributes?.()

  if (hydrateStrategy.type === 'never' && !shouldPreserveServerHTML) {
    return (
      <div
        ref={markerRef}
        {...{
          [hydrateIdAttribute]: gate.id,
          [hydrateWhenAttribute]: hydrateStrategy.type,
          ...markerAttributes,
        }}
      >
        {props.fallback ?? null}
      </div>
    )
  }

  return (
    <div
      ref={markerRef}
      {...{
        [hydrateIdAttribute]: gate.id,
        [hydrateWhenAttribute]: hydrateStrategy.type,
        ...markerAttributes,
      }}
    >
      <React.Suspense fallback={fallback}>
        <HydrationGate gate={gate}>
          <HydratedBoundary
            id={gate.id}
            onHydrated={props.onHydrated}
            onStrategyHydrated={hydrateStrategy.onHydrated}
          >
            {props.children}
          </HydratedBoundary>
        </HydrationGate>
      </React.Suspense>
    </div>
  )
}
