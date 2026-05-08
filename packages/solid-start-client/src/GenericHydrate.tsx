import * as Solid from 'solid-js'
import { Dynamic } from 'solid-js/web'

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
import type { InternalHydrateProps } from './Hydrate'
import type { DynamicProps } from 'solid-js/web'

type HydrationFallbackDynamicProps = DynamicProps<'div'>
type HydrationMarkerDynamicProps = DynamicProps<'div'> & {
  [hydrateIdAttribute]: string
  [hydrateWhenAttribute]: NonNullable<InternalHydrateProps['when']['_t']>
  [key: `data-${string}`]: string | undefined
}

const hydrateIdSelector = `[${hydrateIdAttribute}]`

function shouldDeferHydration(strategy: InternalHydrateProps['when']) {
  return strategy._d ? strategy._d() : strategy._t !== 'load'
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

  const fallbackProps: HydrationFallbackDynamicProps = {
    component: 'div',
    style: { display: 'contents' },
    innerHTML: html,
  }

  return <Dynamic {...fallbackProps} />
}

export function GenericHydrate(props: InternalHydrateProps) {
  const hydrateStrategy = () => props.when
  const prefetchStrategy = () => props.prefetch
  const delegatedStrategy = () => props.g
  const hydrated = useHydrated()
  const uniqueId = Solid.createUniqueId()
  const id = props.h ? `${props.h}${uniqueId}` : uniqueId
  const initialHydrateStrategy = hydrateStrategy()
  const initialHydrateType = initialHydrateStrategy._t!
  const isServerEnvironment =
    (isServer as boolean | undefined) ?? typeof window === 'undefined'
  const shouldPreserveServerHTML = isServerEnvironment || !hydrated()
  const shouldDeferInitialHydration =
    !hydrated() && shouldDeferHydration(initialHydrateStrategy)
  const gate: HydrationGateRecord = isServerEnvironment
    ? createResolvedGate(id, initialHydrateType)
    : getOrCreateGate(id, initialHydrateType)
  const [ready, setReady] = Solid.createSignal(
    isServerEnvironment ||
      (!shouldDeferInitialHydration && initialHydrateType !== 'never'),
  )
  let didPrefetch = false
  let markerElement: HTMLDivElement | undefined

  if (
    !isServerEnvironment &&
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
    const currentHydrateType = currentHydrateStrategy._t!
    gate.when = currentHydrateType
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
      currentHydrateType === 'never' &&
      !shouldPreserveServerHTML &&
      markerElement
    ) {
      markerElement.replaceChildren()
    }

    if (props.p && currentPrefetchStrategy) {
      const prefetch = () => {
        if (didPrefetch) return
        didPrefetch = true
        void props.p?.()
      }
      const cleanupPrefetch = runStrategyCleanup(
        currentPrefetchStrategy._s?.({
          element: markerElement ?? null,
          prefetch,
        }),
      )
      if (cleanupPrefetch) Solid.onCleanup(cleanupPrefetch)
    }

    if (
      currentHydrateType !== 'never' &&
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
      cleanups.forEach((fn) => fn())
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
      currentHydrateType === 'never'
    ) {
      if (gate.resolved) resolveBoundary()
      return
    }

    const context: HydrationRuntimeContext = {
      element: markerElement ?? null,
      gate,
    }
    addCleanup(runStrategyCleanup(currentHydrateStrategy._s?.(context)))

    if (currentDelegatedStrategy?._s) {
      addCleanup(
        runStrategyCleanup(
          currentDelegatedStrategy._s({
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
      isServerEnvironment ||
      gate.resolved ||
      currentHydrateStrategy._t === 'never' ||
      shouldDeferHydration(currentHydrateStrategy)
    ) {
      return
    }

    gate.resolve()
  })

  const markerAttributes = initialHydrateStrategy._a?.()
  const markerProps: HydrationMarkerDynamicProps = {
    component: 'div',
    [hydrateIdAttribute]: id,
    [hydrateWhenAttribute]: initialHydrateType,
    ...markerAttributes,
  }
  const fallback = () =>
    shouldPreserveServerHTML ? (
      <HydrationFallback id={id} />
    ) : (
      (props.fallback ?? null)
    )

  return (
    <Dynamic {...markerProps}>
      {initialHydrateType === 'never' && !shouldPreserveServerHTML ? (
        (props.fallback ?? null)
      ) : (
        <Solid.Suspense fallback={fallback()}>
          <Solid.Show when={ready()} fallback={fallback()}>
            <HydratedBoundary
              id={id}
              onHydrated={props.onHydrated}
              onStrategyHydrated={hydrateStrategy()._o}
            >
              {props.children}
            </HydratedBoundary>
          </Solid.Show>
        </Solid.Suspense>
      )}
    </Dynamic>
  )
}
