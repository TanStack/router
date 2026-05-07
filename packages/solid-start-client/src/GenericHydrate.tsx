import * as Solid from 'solid-js'
import { Dynamic, createComponent } from 'solid-js/web'

import { useHydrated } from '@tanstack/solid-router'
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

const hydrateIdSelector = `[${hydrateIdAttribute}]`

function shouldDeferHydration(strategy: InternalHydrateProps['when']) {
  return strategy.shouldDefer
    ? strategy.shouldDefer()
    : strategy.type !== 'load'
}

function runStrategyCleanup(cleanup: void | (() => void)) {
  if (typeof cleanup === 'function') return cleanup
  return undefined
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

function HydrationFallback(props: { id: string }) {
  const html = getFallbackHtml(props.id)

  if (!html) return null

  return createComponent(Dynamic as any, {
    component: 'div',
    style: { display: 'contents' },
    innerHTML: html,
  })
}

export function GenericHydrate(props: HydrateProps) {
  const internalProps = props as InternalHydrateProps
  const hydrateStrategy = () => internalProps.when
  const prefetchStrategy = () => internalProps.prefetch
  const delegatedStrategy = () => internalProps.__hydrate
  const hydrated = useHydrated()
  const uniqueId = Solid.createUniqueId()
  const id = internalProps.splitId
    ? `${internalProps.splitId}${uniqueId}`
    : uniqueId
  const initialHydrateStrategy = hydrateStrategy()
  const initialHydrateType = initialHydrateStrategy.type
  const shouldPreserveServerHTML =
    ((isServer as boolean | undefined) ?? typeof window === 'undefined') ||
    !hydrated()
  const shouldDeferInitialHydration =
    !hydrated() && shouldDeferHydration(initialHydrateStrategy)
  const gate: HydrationGateRecord =
    ((isServer as boolean | undefined) ?? typeof window === 'undefined')
      ? createResolvedGate(id, initialHydrateStrategy.type)
      : getOrCreateGate(id, initialHydrateStrategy.type)
  const [ready, setReady] = Solid.createSignal(
    ((isServer as boolean | undefined) ?? typeof window === 'undefined') ||
      (!shouldDeferInitialHydration && initialHydrateStrategy.type !== 'never'),
  )
  let didPrefetch = false
  let markerElement: HTMLDivElement | undefined

  if (
    !((isServer as boolean | undefined) ?? typeof window === 'undefined') &&
    initialHydrateType !== 'never' &&
    (!shouldDeferInitialHydration ||
      !shouldDeferHydration(initialHydrateStrategy))
  ) {
    gate.resolve()
  }

  Solid.onMount(() => {
    const currentHydrateStrategy = hydrateStrategy()
    const currentPrefetchStrategy = prefetchStrategy()
    const currentDelegatedStrategy = delegatedStrategy()
    gate.when = currentHydrateStrategy.type
    for (const element of document.querySelectorAll<HTMLDivElement>(
      hydrateIdSelector,
    )) {
      if (element.getAttribute(hydrateIdAttribute) === id) {
        markerElement = element
        saveFallbackHtml(id, element)
        break
      }
    }

    if (
      currentHydrateStrategy.type === 'never' &&
      !shouldPreserveServerHTML &&
      markerElement
    ) {
      markerElement.replaceChildren()
    }

    if (internalProps.preload && currentPrefetchStrategy) {
      const prefetch = () => {
        if (didPrefetch) return
        didPrefetch = true
        void internalProps.preload?.()
      }
      const cleanupPrefetch = runStrategyCleanup(
        currentPrefetchStrategy.setupPrefetch?.({
          element: markerElement ?? null,
          prefetch,
        }),
      )
      if (cleanupPrefetch) Solid.onCleanup(cleanupPrefetch)
    }

    if (
      currentHydrateStrategy.type !== 'never' &&
      (!shouldDeferInitialHydration ||
        !shouldDeferHydration(currentHydrateStrategy))
    ) {
      gate.resolve()
      setReady(true)
    }

    const cleanups: Array<() => void> = []
    let removeResolveListener = () => {}
    let disposed = false

    const resolveBoundary = () => {
      setReady(true)
    }

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

    Solid.onCleanup(() => {
      cleanup()
      releaseGate(gate)
    })

    removeResolveListener = onGateResolve(gate, () => {
      cleanup()
      resolveBoundary()
    })

    if (
      gate.resolved ||
      !shouldDeferInitialHydration ||
      currentHydrateStrategy.type === 'never'
    ) {
      if (gate.resolved) resolveBoundary()
      return
    }

    const context: HydrationRuntimeContext = {
      element: markerElement ?? null,
      gate,
    }
    addCleanup(runStrategyCleanup(currentHydrateStrategy.setup?.(context)))

    if (currentDelegatedStrategy?.setup) {
      addCleanup(
        runStrategyCleanup(
          currentDelegatedStrategy.setup({
            ...context,
            delegated: true,
          }),
        ),
      )
    }
  })

  Solid.createRenderEffect(() => {
    const currentHydrateStrategy = hydrateStrategy()
    if (
      ((isServer as boolean | undefined) ?? typeof window === 'undefined') ||
      gate.resolved ||
      currentHydrateStrategy.type === 'never' ||
      shouldDeferHydration(currentHydrateStrategy)
    ) {
      return
    }

    gate.resolve()
  })

  const markerAttributes = initialHydrateStrategy.getMarkerAttributes?.()
  const fallback = () =>
    shouldPreserveServerHTML
      ? createComponent(HydrationFallback, {
          get id() {
            return id
          },
        })
      : (props.fallback ?? null)

  return createComponent(Dynamic as any, {
    component: 'div',
    get [hydrateIdAttribute]() {
      return id
    },
    get [hydrateWhenAttribute]() {
      return initialHydrateType
    },
    ...markerAttributes,
    get children() {
      if (initialHydrateType === 'never' && !shouldPreserveServerHTML) {
        return props.fallback ?? null
      }

      return createComponent(Solid.Suspense, {
        get fallback() {
          return fallback()
        },
        get children() {
          return createComponent(Solid.Show as any, {
            get when() {
              return ready()
            },
            get fallback() {
              return fallback()
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
                  return hydrateStrategy().onHydrated
                },
                get children() {
                  return props.children
                },
              })
            },
          })
        },
      })
    },
  })
}
