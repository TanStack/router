import * as Solid from 'solid-js'
import { Dynamic, createComponent } from 'solid-js/web'

import { isServer } from '@tanstack/router-core/isServer'
import { hydrateIdAttribute } from '@tanstack/start-client-core/hydration/constants'
import type {
  HydrationPrefetchStrategy,
  VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration'
import type {
  HydrateProps,
  InternalHydrateProps,
  SolidHydrationStrategy,
} from '../Hydrate'

const visibleType = 'visible'

type VisibleGate = {
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
  const gate: VisibleGate = {
    resolved: false,
    resolve: () => {
      if (gate.resolved) return
      gate.resolved = true
    },
  }
  return gate
}

function HydratedBoundary(props: {
  id: string
  onHydrated?: () => void
  onStrategyHydrated?: (id: string) => void
  children: Solid.JSX.Element
}) {
  let didHydrate = false

  Solid.onMount(() => {
    if (didHydrate) return
    didHydrate = true
    props.onHydrated?.()
    props.onStrategyHydrated?.(props.id)
  })

  return props.children
}

export function StrategyHydrate(props: HydrateProps) {
  const internalProps = props as InternalHydrateProps
  const strategy = internalProps.when
  const prefetchStrategy = internalProps.prefetch
  const uniqueId = Solid.createUniqueId()
  const id = internalProps.splitId
    ? `${internalProps.splitId}${uniqueId}`
    : uniqueId
  const gate = createGate()
  const [ready, setReady] = Solid.createSignal(
    (isServer as boolean | undefined) ?? typeof window === 'undefined',
  )
  let didPrefetch = false
  let markerElement: HTMLDivElement | undefined

  if ((isServer as boolean | undefined) ?? typeof window === 'undefined') {
    gate.resolve()
  }

  Solid.onMount(() => {
    if (internalProps.preload && prefetchStrategy) {
      const prefetch = () => {
        if (didPrefetch) return
        didPrefetch = true
        void internalProps.preload?.()
      }
      const cleanupPrefetch = prefetchStrategy.setupPrefetch?.({
        element: markerElement ?? null,
        prefetch,
      })
      if (typeof cleanupPrefetch === 'function')
        Solid.onCleanup(cleanupPrefetch)
    }

    if (gate.resolved) {
      setReady(true)
      return
    }

    const cleanup = strategy.setup?.({
      element: markerElement ?? null,
      gate: gate as any,
    })
    if (typeof cleanup === 'function') Solid.onCleanup(cleanup)
  })

  const resolve = gate.resolve
  gate.resolve = () => {
    resolve()
    setReady(true)
  }

  return createComponent(Dynamic as any, {
    component: 'div',
    ref(element: HTMLDivElement) {
      markerElement = element
    },
    get [hydrateIdAttribute]() {
      return id
    },
    get children() {
      return createComponent(Solid.Show as any, {
        get when() {
          return ready()
        },
        get fallback() {
          return props.fallback ?? null
        },
        get children() {
          return createComponent(HydratedBoundary, {
            get id() {
              return id
            },
            get onHydrated() {
              return props.onHydrated
            },
            get onStrategyHydrated() {
              return strategy.onHydrated
            },
            get children() {
              return props.children
            },
          })
        },
      })
    },
  })
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options?: VisibleHydrationOptions,
): SolidHydrationStrategy & HydrationPrefetchStrategy {
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
