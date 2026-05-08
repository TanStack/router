import type { HydrationPrefetchStrategy } from './types'

const visibleType = 'visible'

export type VisibleHydrationOptions = {
  rootMargin?: string
  threshold?: number | Array<number>
}

type VisibleObserverEntry = {
  key: string
  observer: IntersectionObserver
  elements: Map<Element, Set<() => void>>
}

const observerRegistry = new Map<string, VisibleObserverEntry>()

function getVisibleKey(rootMargin: string, threshold: number | Array<number>) {
  return `${rootMargin}|${
    Array.isArray(threshold) ? threshold.join(',') : String(threshold)
  }`
}

function getObserver(rootMargin: string, threshold: number | Array<number>) {
  const key = getVisibleKey(rootMargin, threshold)
  const existing = observerRegistry.get(key)
  if (existing) return existing

  const entry: VisibleObserverEntry = {
    key,
    elements: new Map<Element, Set<() => void>>(),
    observer: new IntersectionObserver(
      (entries) => {
        for (const observerEntry of entries) {
          if (!observerEntry.isIntersecting) continue
          resolveVisibleElement(entry, observerEntry.target)
        }
      },
      { rootMargin, threshold },
    ),
  }

  observerRegistry.set(key, entry)
  return entry
}

function cleanupVisibleObserverEntry(observerEntry: VisibleObserverEntry) {
  if (observerEntry.elements.size > 0) return
  observerEntry.observer.disconnect()
  observerRegistry.delete(observerEntry.key)
}

function unobserveVisibleCallback(
  observerEntry: VisibleObserverEntry,
  element: Element,
  callback: () => void,
) {
  const currentCallbacks = observerEntry.elements.get(element)
  currentCallbacks?.delete(callback)
  if (currentCallbacks?.size === 0) {
    observerEntry.elements.delete(element)
    observerEntry.observer.unobserve(element)
  }
  cleanupVisibleObserverEntry(observerEntry)
}

function resolveVisibleElement(
  observerEntry: VisibleObserverEntry,
  element: Element,
) {
  const callbacks = observerEntry.elements.get(element)
  if (!callbacks) return

  callbacks.forEach((callback) => callback())
  observerEntry.elements.delete(element)
  observerEntry.observer.unobserve(element)
  cleanupVisibleObserverEntry(observerEntry)
}

function observeVisible(
  element: Element | null,
  callback: () => void,
  rootMargin: string,
  threshold: number | Array<number>,
) {
  if (!element) {
    callback()
    return
  }

  const observerEntry = getObserver(rootMargin, threshold)
  let callbacks = observerEntry.elements.get(element)
  if (!callbacks) {
    callbacks = new Set()
    observerEntry.elements.set(element, callbacks)
    observerEntry.observer.observe(element)
  }
  callbacks.add(callback)

  return () => unobserveVisibleCallback(observerEntry, element, callback)
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options: VisibleHydrationOptions = {},
): HydrationPrefetchStrategy<typeof visibleType> {
  const rootMargin = options.rootMargin ?? '600px'
  const threshold = options.threshold ?? 0

  return {
    _t: visibleType,
    _s: ({ element, gate, prefetch }) =>
      observeVisible(element, prefetch ?? gate!.resolve, rootMargin, threshold),
  }
}
