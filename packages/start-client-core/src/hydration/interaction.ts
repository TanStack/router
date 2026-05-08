import {
  hydrateIdAttribute,
  hydrateInteractionEventsAttribute,
  hydrateWhenAttribute,
} from './constants'
import {
  clearResolvedGateIdsInMarker,
  getMarkerGate,
  resolveHydrationMarker,
} from './runtime'
import type {
  HydrationInteractionEvents,
  HydrationPrefetchStrategy,
  HydrationRuntimeContext,
} from './types'

export type InteractionHydrationOptions = {
  events?: HydrationInteractionEvents
}

const hydrateIdSelector = `[${hydrateIdAttribute}]`

type PendingReplayEvent = {
  marker: Element
  targetPath: Array<number>
  type: string
  event: Event
}

const defaultInteractionEvents = [
  'pointerenter',
  'focusin',
  'pointerdown',
  'click',
] as const
const interactionType = 'interaction'
const interactionHydrateSelector = `[${hydrateWhenAttribute}="${interactionType}"]`
const replayEventsByGateId = new Map<string, Array<PendingReplayEvent>>()

function normalizeInteractionEvents(
  events?: HydrationInteractionEvents,
): ReadonlyArray<string> {
  if (events === undefined) return defaultInteractionEvents

  const eventList: ReadonlyArray<string> =
    typeof events === 'string' ? [events] : events
  const normalizedEvents: Array<string> = []
  const seen = new Set<string>()

  for (const eventName of eventList) {
    if (!eventName || seen.has(eventName)) continue
    seen.add(eventName)
    normalizedEvents.push(eventName)
  }

  return normalizedEvents
}

function getIntentListenerEvents(
  marker: Element,
  events: ReadonlyArray<string>,
) {
  const listenerEvents = new Set(events)

  marker.querySelectorAll(interactionHydrateSelector).forEach((childMarker) => {
    const attr = childMarker.getAttribute(hydrateInteractionEventsAttribute)
    for (const eventName of attr === null
      ? defaultInteractionEvents
      : attr.split(/\s+/).filter(Boolean)) {
      listenerEvents.add(eventName)
    }
  })

  return [...listenerEvents]
}

function getReplayTargetPath(marker: Element, target: EventTarget) {
  if (!(target instanceof Node) || !marker.contains(target)) return []

  const path: Array<number> = []
  let node: Element | null =
    target instanceof Element ? target : target.parentElement

  while (node && node !== marker) {
    const parent = node.parentElement
    if (!parent) return []
    path.push(Array.prototype.indexOf.call(parent.children, node))
    node = parent
  }

  return path.reverse()
}

function queueHydrationReplayEvent(marker: Element, event: Event) {
  if (!event.bubbles) return

  const id = marker.getAttribute(hydrateIdAttribute)
  if (!id || marker.getAttribute(hydrateWhenAttribute) === 'never') return

  const target = event.target
  if (!target) return

  const gate = getMarkerGate(marker)
  if (!gate || gate.resolved) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const pendingEvents = replayEventsByGateId.get(id) ?? []
  pendingEvents.push({
    marker,
    targetPath: getReplayTargetPath(marker, target),
    type: event.type,
    event,
  })
  replayEventsByGateId.set(id, pendingEvents)
}

function createReplayEvent(event: Event) {
  if (event instanceof MouseEvent) {
    return new MouseEvent(event.type, event)
  }

  if (event instanceof FocusEvent) {
    return new FocusEvent(event.type, event)
  }

  return new Event(event.type, event)
}

function replayHydrationEvents(id: string) {
  const pendingEvents = replayEventsByGateId.get(id)
  if (!pendingEvents?.length) return

  replayEventsByGateId.delete(id)

  for (const pendingEvent of pendingEvents) {
    let replayTarget: Element | null = pendingEvent.marker
    for (const index of pendingEvent.targetPath) {
      replayTarget = replayTarget.children[index] ?? null
      if (!replayTarget) break
    }

    replayTarget ??= pendingEvent.marker
    replayTarget.dispatchEvent(createReplayEvent(pendingEvent.event))
  }
}

function getIntentMarkers(rootMarker: Element, event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return [rootMarker]

  const closestMarker = target.closest(hydrateIdSelector)
  let marker: Element | null =
    closestMarker && rootMarker.contains(closestMarker)
      ? closestMarker
      : rootMarker

  const markers: Array<Element> = []
  while (marker) {
    if (marker.hasAttribute(hydrateIdAttribute)) {
      markers.push(marker)
    }
    if (marker === rootMarker) break
    marker = marker.parentElement
  }

  if (!markers.includes(rootMarker)) {
    markers.push(rootMarker)
  }

  return markers.reverse()
}

function listenForIntent(
  element: Element,
  events: ReadonlyArray<string>,
  context: HydrationRuntimeContext,
) {
  const onIntent = (event: Event) => {
    const markers = getIntentMarkers(element, event)
    if (
      context.delegated &&
      !markers.some(
        (marker) =>
          marker.getAttribute(hydrateWhenAttribute) === interactionType,
      )
    ) {
      return
    }

    markers.forEach((marker) => {
      queueHydrationReplayEvent(marker, event)
      resolveHydrationMarker(marker)
    })
  }
  let disposed = false

  events.forEach((eventName) => {
    element.addEventListener(eventName, onIntent, true)
  })

  return () => {
    if (disposed) return
    disposed = true
    events.forEach((eventName) => {
      element.removeEventListener(eventName, onIntent, true)
    })
  }
}

function listenForPrefetchIntent(
  element: Element,
  events: ReadonlyArray<string>,
  prefetch: () => void,
) {
  let disposed = false

  events.forEach((eventName) => {
    element.addEventListener(eventName, prefetch, true)
  })

  return () => {
    if (disposed) return
    disposed = true
    events.forEach((eventName) => {
      element.removeEventListener(eventName, prefetch, true)
    })
  }
}

/* @__NO_SIDE_EFFECTS__ */
export function interaction(
  options: InteractionHydrationOptions = {},
): HydrationPrefetchStrategy<typeof interactionType> {
  const events = normalizeInteractionEvents(options.events)
  const eventKey = events.join(' ')

  return {
    _t: interactionType,
    _s: (context) => {
      const element = context.element
      if (!element) return
      if (context.prefetch) {
        if (!events.length) return
        return listenForPrefetchIntent(element, events, context.prefetch)
      }

      const listenerEvents = getIntentListenerEvents(element, events)
      const cleanupIntent = listenerEvents.length
        ? listenForIntent(element, listenerEvents, context)
        : undefined
      return () => {
        cleanupIntent?.()
        clearResolvedGateIdsInMarker(element)
      }
    },
    _o: (id) => {
      globalThis.requestAnimationFrame(() => replayHydrationEvents(id))
    },
    _a: () =>
      options.events === undefined
        ? undefined
        : {
            [hydrateInteractionEventsAttribute]: eventKey,
          },
  }
}
