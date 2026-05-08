import type * as Solid from 'solid-js'

import type {
  HydrationStrategy as CoreHydrationStrategy,
  HydrationPrefetchStrategy,
  HydrationWhen,
} from '@tanstack/start-client-core/hydration'

export type {
  HydrationInteractionEvent,
  HydrationInteractionEvents,
  HydrationPrefetchStrategy,
  HydrationWhen,
} from '@tanstack/start-client-core/hydration'

export type SolidHydrationStrategy<
  TWhen extends HydrationWhen = HydrationWhen,
  TCanPrefetch extends boolean = boolean,
> = CoreHydrationStrategy<TWhen, TCanPrefetch> & {
  _h: (props: HydrateProps) => Solid.JSX.Element
}

export type HydrationStrategy<
  TWhen extends HydrationWhen = HydrationWhen,
  TCanPrefetch extends boolean = boolean,
> = SolidHydrationStrategy<TWhen, TCanPrefetch>

export type HydrateOptions = {
  when: SolidHydrationStrategy
}

type HydrateCommonProps = {
  fallback?: Solid.JSX.Element
  onHydrated?: () => void
  children: Solid.JSX.Element
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
  g?: CoreHydrationStrategy
  h?: string
  p?: () => Promise<void>
}

export function Hydrate(props: HydrateProps) {
  return props.when._h(props)
}
