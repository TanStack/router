'use client'

import type * as React from 'react'

import type {
  HydrationStrategy as CoreHydrationStrategy,
  HydrationPrefetchStrategy,
} from '@tanstack/start-client-core/hydration'

export type {
  HydrationInteractionEvent,
  HydrationInteractionEvents,
  HydrationPrefetchStrategy,
  HydrationWhen,
} from '@tanstack/start-client-core/hydration'

export type ReactHydrationStrategy = CoreHydrationStrategy & {
  $$renderHydrate: (props: HydrateProps) => React.JSX.Element
}

export type HydrationStrategy = ReactHydrationStrategy

export type HydrateOptions = {
  when: ReactHydrationStrategy
}

type HydrateCommonProps = {
  fallback?: React.ReactNode
  onHydrated?: () => void
  children: React.ReactNode
}

export type HydrateProps =
  | (HydrateCommonProps &
      HydrateOptions & {
        prefetch?: never
        split?: boolean
      })
  | (HydrateCommonProps &
      HydrateOptions & {
        prefetch: HydrationPrefetchStrategy
        split?: true
      })

export type InternalHydrateProps = HydrateProps & {
  __hydrate?: CoreHydrationStrategy
  splitId?: string
  preload?: () => Promise<void>
}

export function Hydrate(props: HydrateProps): React.JSX.Element {
  return props.when.$$renderHydrate(props)
}
