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
  id: string
  when: HydrationWhen
  resolved: boolean
  resolve: () => void
}

export type HydrationRuntimeContext = {
  element: Element | null
  gate: HydrationRuntimeGate
  delegated?: boolean
}

export type HydrationPrefetchContext = {
  element: Element | null
  prefetch: () => void
}

export type HydrationStrategy = {
  type: HydrationWhen
  key: string
  shouldDefer?: () => boolean
  setup?: (context: HydrationRuntimeContext) => void | (() => void)
  setupPrefetch?: (context: HydrationPrefetchContext) => void | (() => void)
  onHydrated?: (id: string) => void
  getMarkerAttributes?: () => HydrationMarkerAttributes | undefined
}

export type HydrationPrefetchStrategy = HydrationStrategy & {
  type: Exclude<HydrationWhen, 'condition' | 'never'>
}
