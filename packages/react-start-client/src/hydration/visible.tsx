'use client'

import * as React from 'react'

import { reactUse } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import type {
  HydrationPrefetchStrategy,
  VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration'
import type {
  HydrateProps,
  InternalHydrateProps,
  ReactHydrationStrategy,
} from '../Hydrate'

type VisibleGate = {
  p: Promise<void>
  r: boolean
  resolve: () => void
}

function HydrationBoundary(props: {
  g: VisibleGate
  o?: () => void
  children?: React.ReactNode
}) {
  const { g, o } = props

  if (!g.r) {
    if (reactUse) {
      reactUse(g.p)
    } else {
      throw g.p
    }
  }

  React.useEffect(() => {
    o?.()
  }, [o])

  return props.children as React.JSX.Element
}

export function StrategyHydrate(props: HydrateProps): React.JSX.Element {
  const strategy = props.when
  const prefetchStrategy = props.prefetch
  const preload = (props as InternalHydrateProps).p
  const markerRef = React.useRef<HTMLDivElement | null>(null)
  const [gate] = React.useState<VisibleGate>(() => {
    let resolvePromise!: () => void
    const nextGate: VisibleGate = {
      p: new Promise<void>((resolve) => {
        resolvePromise = resolve
      }),
      r: false,
      resolve: () => {
        nextGate.r = true
        resolvePromise()
      },
    }
    if ((isServer as boolean | undefined) ?? typeof window === 'undefined') {
      nextGate.resolve()
    }

    return nextGate
  })

  React.useEffect(() => {
    if (!preload || !prefetchStrategy) return

    const cleanup = prefetchStrategy._s!({
      element: markerRef.current,
      prefetch: preload,
    })
    if (typeof cleanup === 'function') return cleanup
    return undefined
  }, [prefetchStrategy, preload])

  React.useEffect(() => {
    if (gate.r) return

    const cleanup = strategy._s!({
      element: markerRef.current,
      gate: gate as never,
    })
    if (typeof cleanup === 'function') return cleanup
    return undefined
  }, [gate, strategy])

  return React.createElement(
    'div',
    { ref: markerRef },
    React.createElement(
      React.Suspense,
      { fallback: props.fallback },
      React.createElement(
        HydrationBoundary,
        {
          g: gate,
          o: props.onHydrated,
        },
        props.children,
      ),
    ),
  )
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options?: VisibleHydrationOptions,
): ReactHydrationStrategy<'visible', true> &
  HydrationPrefetchStrategy<'visible'> {
  const observerOptions = {
    rootMargin: options?.rootMargin || '600px',
    threshold: options?.threshold || 0,
  }
  const setup = (context: any) => {
    const callback = context.prefetch ?? context.gate.resolve
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]!.isIntersecting) return
      observer.disconnect()
      callback()
    }, observerOptions)
    observer.observe(context.element)
    return () => observer.disconnect()
  }

  return {
    _s: setup,
    _h: StrategyHydrate,
  } as ReactHydrationStrategy<'visible', true> &
    HydrationPrefetchStrategy<'visible'>
}
