import * as Solid from 'solid-js'

import type {
  HydrationPrefetchStrategy,
  HydrationRuntimeContext,
} from '@tanstack/start-client-core/hydration'
import type {
  HydrateProps,
  InternalHydrateProps,
  SolidHydrationStrategy,
} from '../Hydrate'

const loadType = 'load'

export function LoadHydrate(props: HydrateProps) {
  const internalProps = props as InternalHydrateProps
  const uniqueId = Solid.createUniqueId()
  const id = internalProps.h ? `${internalProps.h}${uniqueId}` : uniqueId

  Solid.onMount(() => {
    props.onHydrated?.()
  })

  return (
    <div data-ts-hydrate-id={id} data-ts-hydrate-when={loadType}>
      <Solid.Suspense fallback={props.fallback ?? null}>
        {props.children}
      </Solid.Suspense>
    </div>
  )
}

const loadStrategy = {
  _s: ({ gate, prefetch }: HydrationRuntimeContext) => {
    ;(prefetch ?? gate!.resolve)()
  },
  _h: LoadHydrate,
} as SolidHydrationStrategy<'load', true> & HydrationPrefetchStrategy<'load'>

/* @__NO_SIDE_EFFECTS__ */
export function load(): SolidHydrationStrategy<'load', true> &
  HydrationPrefetchStrategy<'load'> {
  return loadStrategy
}
