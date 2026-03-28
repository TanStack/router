import { isServer } from '@tanstack/router-core/isServer'
import { functionalUpdate, isPlainObject } from './utils'
import type { AnyRouter } from './router'
import type { ParsedLocation } from './location'
import type { NonNullableUpdater } from './utils'

export type ScrollRestorationEntry = { scrollX: number; scrollY: number }

type ScrollRestorationByElement = Record<string, ScrollRestorationEntry>

type ScrollRestorationByKey = Record<string, ScrollRestorationByElement>

type ScrollRestorationCache = {
  readonly state: ScrollRestorationByKey
  set: (updater: NonNullableUpdater<ScrollRestorationByKey>) => void
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
    set: (updater) => {
      state = functionalUpdate(updater, state) || state
    },
    persist,
  }
}

export const scrollRestorationCache = createScrollRestorationCache()

/**
 * The default `getKey` function for `useScrollRestoration`.
 * It returns the `key` from the location state or the `href` of the location.
 *
 * The `location.href` is used as a fallback to support the use case where the location state is not available like the initial render.
 */
export const defaultGetScrollRestorationKey = (location: ParsedLocation) => {
  return location.state.__TSR_key! || location.href
}

function getCssSelector(el: any): string {
  const path = []
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
    element instanceof Window ? windowScrollTarget : getCssSelector(element)
  ]
}

let ignoreScroll = false
const windowScrollTarget = 'window'
const scrollRestorationIdAttribute = 'data-scroll-restoration-id'
type ScrollTarget = typeof windowScrollTarget | Element

export function setupScrollRestoration(router: AnyRouter, force?: boolean) {
  if (!scrollRestorationCache && !(isServer ?? router.isServer)) {
    return
  }

  const cache = scrollRestorationCache

  const shouldScrollRestoration =
    force ?? router.options.scrollRestoration ?? false

  if (shouldScrollRestoration) {
    router.isScrollRestoring = true
  }

  if (
    (isServer ?? router.isServer) ||
    router.isScrollRestorationSetup ||
    !cache
  ) {
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
      !cache
    ) {
      return
    }

    const keyEntry = (cache.state[restoreKey] ||=
      {} as ScrollRestorationByElement)

    for (const [target, position] of trackedScrollEntries) {
      let selector: string | undefined

      if (target === windowScrollTarget) {
        selector = windowScrollTarget
      } else if (target.isConnected) {
        const attrId = target.getAttribute(scrollRestorationIdAttribute)
        selector = attrId
          ? `[${scrollRestorationIdAttribute}="${attrId}"]`
          : getCssSelector(target)
      }

      if (!selector) {
        continue
      }

      keyEntry[selector] = position
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
        router.stores.resolvedLocation.state ?? router.stores.location.state,
      ),
    )
    cache.persist()
  })

  // Restore destination scroll after the new route has rendered.
  router.subscribe('onRendered', (event) => {
    const cacheKey = getKey(event.toLocation)
    const behavior = router.options.scrollRestorationBehavior
    const scrollToTopSelectors = router.options.scrollToTopSelectors
    trackedScrollEntries.clear()

    if (!router.resetNextScroll) {
      router.resetNextScroll = true
      return
    }

    if (
      typeof router.options.scrollRestoration === 'function' &&
      !router.options.scrollRestoration({ location: router.latestLocation })
    ) {
      return
    }

    ignoreScroll = true

    try {
      const elementEntries = router.isScrollRestoring
        ? cache.state[cacheKey]
        : undefined
      let restored = false

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
            window.scrollTo({
              top: scrollY as number,
              left: scrollX as number,
              behavior,
            })
            restored = true
          } else if (elementSelector) {
            let element

            try {
              element = document.querySelector(elementSelector)
            } catch {
              continue
            }

            if (element) {
              element.scrollLeft = scrollX as number
              element.scrollTop = scrollY as number
              restored = true
            }
          }
        }
      }

      if (!restored) {
        const hash = router.history.location.hash.slice(1)

        if (hash) {
          const hashScrollIntoViewOptions =
            window.history.state?.__hashScrollIntoViewOptions ?? true

          if (hashScrollIntoViewOptions) {
            const el = document.getElementById(hash)
            if (el) {
              el.scrollIntoView(hashScrollIntoViewOptions)
            }
          }
        } else {
          const scrollOptions = {
            top: 0,
            left: 0,
            behavior,
          }

          window.scrollTo(scrollOptions)
          if (scrollToTopSelectors) {
            for (const selector of scrollToTopSelectors) {
              if (selector === windowScrollTarget) continue
              const element =
                typeof selector === 'function'
                  ? selector()
                  : document.querySelector(selector)
              if (element) {
                element.scrollTo(scrollOptions)
              }
            }
          }
        }
      }
    } finally {
      ignoreScroll = false
    }

    if (router.isScrollRestoring) {
      cache.set((state) => {
        state[cacheKey] ||= {} as ScrollRestorationByElement
        return state
      })
    }
  })
}
