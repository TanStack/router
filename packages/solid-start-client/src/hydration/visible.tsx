import * as Solid from 'solid-js'
import { Dynamic, createComponent } from 'solid-js/web'

import { isServer } from '@tanstack/router-core/isServer'
import type {
  HydrationPrefetchStrategy,
  VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration'
import type {
  HydrateProps,
  InternalHydrateProps,
  SolidHydrationStrategy,
} from '../Hydrate'

export function StrategyHydrate(props: HydrateProps) {
  const internalProps = props as InternalHydrateProps
  const strategy = internalProps.when
  const prefetchStrategy = internalProps.prefetch
  const preload = internalProps.p
  const uniqueId = Solid.createUniqueId()
  const id = internalProps.h ? `${internalProps.h}${uniqueId}` : uniqueId
  const isServerEnvironment =
    (isServer as boolean | undefined) ?? typeof window === 'undefined'
  let resolved = isServerEnvironment
  const [ready, setReady] = Solid.createSignal(resolved)
  const gate = {
    resolve: () => {
      if (resolved) return
      resolved = true
      setReady(true)
      props.onHydrated?.()
    },
  }
  let markerElement: HTMLDivElement | undefined

  Solid.onMount(() => {
    if (preload && prefetchStrategy) {
      const cleanupPrefetch = prefetchStrategy._s!({
        element: markerElement!,
        prefetch: preload,
      })
      if (typeof cleanupPrefetch === 'function')
        Solid.onCleanup(cleanupPrefetch)
    }

    const cleanup = strategy._s!({
      element: markerElement!,
      gate: gate as never,
    })
    if (typeof cleanup === 'function') Solid.onCleanup(cleanup)
  })

  return createComponent(Dynamic as any, {
    component: 'div',
    ref(element: HTMLDivElement) {
      markerElement = element
    },
    'data-ts-hydrate-id': id,
    get children() {
      return ready() ? props.children : (props.fallback ?? null)
    },
  })
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options?: VisibleHydrationOptions,
): SolidHydrationStrategy<'visible', true> &
  HydrationPrefetchStrategy<'visible'> {
  const observerOptions = {
    rootMargin: options?.rootMargin ?? '600px',
    threshold: options?.threshold ?? 0,
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
  } as SolidHydrationStrategy<'visible', true> &
    HydrationPrefetchStrategy<'visible'>
}
