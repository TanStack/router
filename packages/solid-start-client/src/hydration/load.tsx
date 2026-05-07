import * as Solid from 'solid-js'
import { Dynamic, createComponent } from 'solid-js/web'

import { load as coreLoad } from '@tanstack/start-client-core/hydration'
import {
  hydrateIdAttribute,
  hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants'
import type {
  HydrateProps,
  InternalHydrateProps,
  SolidHydrationStrategy,
} from '../Hydrate'

const loadType = 'load'

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

export function LoadHydrate(props: HydrateProps) {
  const internalProps = props as InternalHydrateProps
  const uniqueId = Solid.createUniqueId()
  const id = internalProps.splitId
    ? `${internalProps.splitId}${uniqueId}`
    : uniqueId

  return createComponent(Dynamic as any, {
    component: 'div',
    get [hydrateIdAttribute]() {
      return id
    },
    [hydrateWhenAttribute]: loadType,
    get children() {
      return createComponent(Solid.Suspense, {
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
              return internalProps.when.onHydrated
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
export function load(): SolidHydrationStrategy {
  return /* @__PURE__ */ Object.assign(coreLoad(), {
    $$renderHydrate: LoadHydrate,
  })
}
