import type { HydrationPrefetchStrategy, HydrationStrategy } from './types'

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
let visibleFallbackListenersInstalled = false
let visibleFallbackCheckHandle: number | undefined
let visibleFallbackCheckType: 'animation-frame' | 'timeout' | undefined =
  undefined

function hasIntersectionObserver() {
  return (
    typeof (
      globalThis as unknown as {
        IntersectionObserver?: typeof IntersectionObserver
      }
    ).IntersectionObserver === 'function'
  )
}

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
  removeVisibleFallbackListeners()
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

function isElementInViewport(element: Element) {
  const rect = element.getBoundingClientRect()
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth

  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < viewportHeight &&
    rect.left < viewportWidth
  )
}

function checkVisibleFallbacks() {
  visibleFallbackCheckHandle = undefined
  visibleFallbackCheckType = undefined

  observerRegistry.forEach((observerEntry) => {
    observerEntry.elements.forEach((_callbacks, element) => {
      if (!isElementInViewport(element)) return
      resolveVisibleElement(observerEntry, element)
    })
  })
}

function scheduleVisibleFallbackCheck() {
  if (
    visibleFallbackCheckHandle !== undefined ||
    typeof window === 'undefined'
  ) {
    return
  }

  if (typeof window.requestAnimationFrame === 'function') {
    visibleFallbackCheckType = 'animation-frame'
    visibleFallbackCheckHandle = window.requestAnimationFrame(
      checkVisibleFallbacks,
    )
    return
  }

  visibleFallbackCheckType = 'timeout'
  visibleFallbackCheckHandle = window.setTimeout(checkVisibleFallbacks, 16)
}

function cancelVisibleFallbackCheck() {
  if (
    visibleFallbackCheckHandle === undefined ||
    typeof window === 'undefined'
  ) {
    return
  }

  if (visibleFallbackCheckType === 'animation-frame') {
    window.cancelAnimationFrame(visibleFallbackCheckHandle)
  } else {
    window.clearTimeout(visibleFallbackCheckHandle)
  }

  visibleFallbackCheckHandle = undefined
  visibleFallbackCheckType = undefined
}

function installVisibleFallbackListeners() {
  if (visibleFallbackListenersInstalled || typeof window === 'undefined') {
    return
  }
  visibleFallbackListenersInstalled = true
  window.addEventListener('scroll', scheduleVisibleFallbackCheck, {
    capture: true,
    passive: true,
  })
  window.addEventListener('resize', scheduleVisibleFallbackCheck)
}

function removeVisibleFallbackListeners() {
  if (!visibleFallbackListenersInstalled || observerRegistry.size > 0) return
  visibleFallbackListenersInstalled = false
  window.removeEventListener('scroll', scheduleVisibleFallbackCheck, true)
  window.removeEventListener('resize', scheduleVisibleFallbackCheck)
  cancelVisibleFallbackCheck()
}

function observeVisible(
  element: Element | null,
  callback: () => void,
  rootMargin: string,
  threshold: number | Array<number>,
) {
  if (!element || !hasIntersectionObserver()) {
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
  installVisibleFallbackListeners()

  if (isElementInViewport(element)) {
    resolveVisibleElement(observerEntry, element)
  } else {
    scheduleVisibleFallbackCheck()
  }

  return () => unobserveVisibleCallback(observerEntry, element, callback)
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options: VisibleHydrationOptions = {},
): HydrationStrategy & HydrationPrefetchStrategy {
  const rootMargin = options.rootMargin ?? '600px'
  const threshold = options.threshold ?? 0

  return {
    type: visibleType,
    key: `${visibleType}:${getVisibleKey(rootMargin, threshold)}`,
    setup: ({ element, gate }) =>
      observeVisible(element, gate.resolve, rootMargin, threshold),
    setupPrefetch: ({ element, prefetch }) =>
      observeVisible(element, prefetch, rootMargin, threshold),
  }
}
