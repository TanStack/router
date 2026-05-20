import { isServer } from '@tanstack/router-core/isServer'
import { isPlainObject } from './utils'
import { getLocationHistoryAction } from './router'
import type { AnyRouter } from './router'
import type { ParsedLocation } from './location'

export type ScrollRestorationEntry = { scrollX: number; scrollY: number }

type ScrollRestorationByElement = Record<string, ScrollRestorationEntry>

type ScrollRestorationByKey = Record<string, ScrollRestorationByElement>

type ScrollRestorationCache = {
  readonly state: ScrollRestorationByKey
  persist: () => void
}

export type ScrollRestorationOptions = {
  getKey?: (location: ParsedLocation) => string
  scrollBehavior?: ScrollToOptions['behavior']
}

function getSafeSessionStorage() {
  try {
    return typeof window !== 'undefined' &&
      typeof window.sessionStorage === 'object'
      ? window.sessionStorage
      : undefined
  } catch {
    // silent
    return undefined
  }
}

// SessionStorage key used to store scroll positions across navigations.
export const storageKey = 'tsr-scroll-restoration-v1_3'

function createScrollRestorationCache(): ScrollRestorationCache | null {
  const safeSessionStorage = getSafeSessionStorage()
  if (!safeSessionStorage) {
    return null
  }

  let state: ScrollRestorationByKey = {}

  try {
    const parsed = JSON.parse(safeSessionStorage.getItem(storageKey) || '{}')
    if (isPlainObject(parsed)) {
      state = parsed as ScrollRestorationByKey
    }
  } catch {
    // ignore invalid session storage payloads
  }

  const persist = () => {
    try {
      safeSessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ts-router] Could not persist scroll restoration state to sessionStorage.',
        )
      }
    }
  }

  return {
    get state() {
      return state
    },
    persist,
  }
}

const scrollRestorationCache = createScrollRestorationCache()

/**
 * The default `getKey` function for `useScrollRestoration`.
 * It returns the `key` from the location state or the `href` of the location.
 *
 * The `location.href` is used as a fallback to support the use case where the location state is not available like the initial render.
 */
export const defaultGetScrollRestorationKey = (location: ParsedLocation) => {
  return location.state.__TSR_key! || location.href
}

function getScrollRestorationSelector(element: Element): string {
  const attrId = element.getAttribute(scrollRestorationIdAttribute)
  if (attrId) {
    return `[${scrollRestorationIdAttribute}="${attrId}"]`
  }

  const path = []
  let el: any = element
  let parent: HTMLElement

  while ((parent = el.parentNode)) {
    path.push(
      `${el.tagName}:nth-child(${Array.prototype.indexOf.call(parent.children, el) + 1})`,
    )
    el = parent
  }

  return `${path.reverse().join(' > ')}`.toLowerCase()
}

export function getElementScrollRestorationEntry(
  router: AnyRouter,
  options: (
    | {
        id: string
        getElement?: () => Window | Element | undefined | null
      }
    | {
        id?: string
        getElement: () => Window | Element | undefined | null
      }
  ) & {
    getKey?: (location: ParsedLocation) => string
  },
): ScrollRestorationEntry | undefined {
  const getKey = options.getKey || defaultGetScrollRestorationKey
  const restoreKey = getKey(router.latestLocation)

  if (options.id) {
    return scrollRestorationCache?.state[restoreKey]?.[
      `[${scrollRestorationIdAttribute}="${options.id}"]`
    ]
  }

  const element = options.getElement?.()
  if (!element) {
    return
  }

  return scrollRestorationCache?.state[restoreKey]?.[
    element instanceof Window
      ? windowScrollTarget
      : getScrollRestorationSelector(element)
  ]
}

let ignoreScroll = false
const windowScrollTarget = 'window'
const scrollRestorationIdAttribute = 'data-scroll-restoration-id'
type ScrollTarget = typeof windowScrollTarget | Element

function getElement(selector: string | (() => Element | null | undefined)) {
  try {
    return typeof selector === 'function'
      ? selector()
      : document.querySelector(selector)
  } catch {}
  return
}

function getScrollToTopElements(
  scrollToTopSelectors: NonNullable<
    AnyRouter['options']['scrollToTopSelectors']
  >,
): Array<Element> {
  const elements: Array<Element> = []

  for (const selector of scrollToTopSelectors) {
    if (selector === windowScrollTarget) {
      continue
    }

    const element = getElement(selector)
    if (element) {
      elements.push(element)
    }
  }

  return elements
}

export function setupScrollRestoration(router: AnyRouter, force?: boolean) {
  // Keep hash/top scrolling active even when sessionStorage is unavailable.

  if (force ?? router.options.scrollRestoration ?? false) {
    router.isScrollRestoring = true
  }

  if ((isServer ?? router.isServer) || router.isScrollRestorationSetup) {
    return
  }

  router.isScrollRestorationSetup = true
  ignoreScroll = false

  const getKey =
    router.options.getScrollRestorationKey || defaultGetScrollRestorationKey
  const trackedScrollEntries = new Map<ScrollTarget, ScrollRestorationEntry>()

  window.history.scrollRestoration = 'manual'

  const onScroll = (event: Event) => {
    if (ignoreScroll || !router.isScrollRestoring) {
      return
    }

    if (event.target === document || event.target === window) {
      trackedScrollEntries.set(windowScrollTarget, {
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
      })
    } else {
      const target = event.target as Element
      trackedScrollEntries.set(target, {
        scrollX: target.scrollLeft || 0,
        scrollY: target.scrollTop || 0,
      })
    }
  }

  // Snapshot the current page's tracked scroll targets before navigation or unload.
  const snapshotCurrentScrollTargets = (restoreKey?: string) => {
    if (
      !router.isScrollRestoring ||
      !restoreKey ||
      trackedScrollEntries.size === 0 ||
      !scrollRestorationCache
    ) {
      return
    }

    const keyEntry = (scrollRestorationCache.state[restoreKey] ||=
      {} as ScrollRestorationByElement)

    for (const [target, position] of trackedScrollEntries) {
      if (target === windowScrollTarget) {
        keyEntry[windowScrollTarget] = position
      } else if (target.isConnected) {
        keyEntry[getScrollRestorationSelector(target)] = position
      }
    }
  }

  document.addEventListener('scroll', onScroll, true)
  router.subscribe('onBeforeLoad', (event) => {
    snapshotCurrentScrollTargets(
      event.fromLocation ? getKey(event.fromLocation) : undefined,
    )
    trackedScrollEntries.clear()
  })
  window.addEventListener('pagehide', () => {
    snapshotCurrentScrollTargets(
      getKey(
        router.stores.resolvedLocation.get() ?? router.stores.location.get(),
      ),
    )
    scrollRestorationCache?.persist()
  })

  // Restore destination scroll after the new route has rendered.
  router.subscribe('onRendered', (event) => {
    const behavior = router.options.scrollRestorationBehavior
    const scrollToTopSelectors = router.options.scrollToTopSelectors
    const shouldResetScroll = router.resetNextScroll
    let scrollToTopElements: Array<Element> | undefined
    trackedScrollEntries.clear()

    if (!shouldResetScroll) {
      router.resetNextScroll = true
    }

    if (
      typeof router.options.scrollRestoration === 'function' &&
      !router.options.scrollRestoration({ location: router.latestLocation })
    ) {
      return
    }

    const cacheKey = getKey(event.toLocation)
    const fromCacheKey = event.fromLocation && getKey(event.fromLocation)

    if (
      router.isScrollRestoring &&
      scrollRestorationCache &&
      fromCacheKey &&
      fromCacheKey !== cacheKey
    ) {
      const fromElementEntries = scrollRestorationCache.state[fromCacheKey]

      if (fromElementEntries) {
        let toElementEntries = scrollRestorationCache.state[cacheKey]

        for (const elementSelector in fromElementEntries) {
          if (elementSelector === windowScrollTarget) {
            if (shouldResetScroll) {
              continue
            }
          } else {
            const element = getElement(elementSelector)
            if (!element) {
              continue
            }

            if (shouldResetScroll && scrollToTopSelectors) {
              scrollToTopElements ??=
                getScrollToTopElements(scrollToTopSelectors)
              if (scrollToTopElements.includes(element)) {
                continue
              }
            }
          }

          if (!toElementEntries) {
            toElementEntries = scrollRestorationCache.state[cacheKey] =
              {} as ScrollRestorationByElement
          }

          toElementEntries[elementSelector] ??=
            fromElementEntries[elementSelector]!
        }
      }
    }

    if (!shouldResetScroll) {
      return
    }

    ignoreScroll = true

    try {
      const hash = event.toLocation.hash
      const hashScrollIntoViewOptions =
        event.toLocation.state.__hashScrollIntoViewOptions ?? true
      const action = getLocationHistoryAction(event.toLocation)
      const skipWindowRestore =
        hash &&
        hashScrollIntoViewOptions &&
        (action === 'PUSH' || action === 'REPLACE')

      const elementEntries = router.isScrollRestoring
        ? scrollRestorationCache?.state[cacheKey]
        : undefined
      let windowRestored = false

      if (elementEntries) {
        for (const elementSelector in elementEntries) {
          const entry = elementEntries[elementSelector]

          if (!isPlainObject(entry)) {
            continue
          }

          const { scrollX, scrollY } = entry as {
            scrollX?: unknown
            scrollY?: unknown
          }

          if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY)) {
            continue
          }

          if (elementSelector === windowScrollTarget) {
            if (skipWindowRestore) {
              continue
            }

            window.scrollTo({
              top: scrollY as number,
              left: scrollX as number,
              behavior,
            })
            windowRestored = true
          } else {
            const element = getElement(elementSelector)
            if (element) {
              element.scrollLeft = scrollX as number
              element.scrollTop = scrollY as number
            }
          }
        }
      }

      if (!windowRestored) {
        if (hash) {
          if (hashScrollIntoViewOptions) {
            document
              .getElementById(hash)
              ?.scrollIntoView(hashScrollIntoViewOptions)
          }
        } else {
          const scrollOptions = {
            top: 0,
            left: 0,
            behavior,
          }

          window.scrollTo(scrollOptions)
          if (scrollToTopSelectors) {
            scrollToTopElements ??= getScrollToTopElements(scrollToTopSelectors)
            for (const element of scrollToTopElements) {
              element.scrollTo(scrollOptions)
            }
          }
        }
      }
    } finally {
      ignoreScroll = false
    }

    if (router.isScrollRestoring && scrollRestorationCache) {
      scrollRestorationCache.state[cacheKey] ||=
        {} as ScrollRestorationByElement
    }
  })
}
