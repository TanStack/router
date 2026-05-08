export type HydrationWhen =
  | 'load'
  | 'idle'
  | 'visible'
  | 'media'
  | 'interaction'
  | 'condition'
  | 'never'

export type HydrationInteractionEvent =
  | 'auxclick'
  | 'click'
  | 'contextmenu'
  | 'dblclick'
  | 'focusin'
  | 'keydown'
  | 'keyup'
  | 'mousedown'
  | 'mouseenter'
  | 'mouseover'
  | 'mouseup'
  | 'pointerdown'
  | 'pointerenter'
  | 'pointerover'
  | 'pointerup'

export type HydrationInteractionEvents =
  | HydrationInteractionEvent
  | ReadonlyArray<HydrationInteractionEvent>

export type HydrationMarkerAttributes = Record<string, string | undefined>

export type HydrationRuntimeGate = {
  id?: string
  when?: HydrationWhen
  resolved: boolean
  resolve: () => void
}

export type HydrationRuntimeContext = {
  element: Element | null
  gate?: HydrationRuntimeGate
  prefetch?: () => void
  delegated?: boolean
}

export type HydrationStrategyTypes<
  TWhen extends HydrationWhen = HydrationWhen,
  TCanPrefetch extends boolean = boolean,
> = {
  when: TWhen
  canPrefetch: TCanPrefetch
}

export type HydrationStrategy<
  TWhen extends HydrationWhen = HydrationWhen,
  TCanPrefetch extends boolean = boolean,
> = {
  _t?: TWhen
  readonly '~types'?: HydrationStrategyTypes<TWhen, TCanPrefetch>
  _d?: () => boolean
  _s?: (context: HydrationRuntimeContext) => void | (() => void)
  _o?: (id: string) => void
  _a?: () => HydrationMarkerAttributes | undefined
}

export type HydrationPrefetchWhen = Exclude<
  HydrationWhen,
  'condition' | 'never'
>

export type HydrationPrefetchStrategy<
  TWhen extends HydrationPrefetchWhen = HydrationPrefetchWhen,
> = HydrationStrategy<TWhen, true>
