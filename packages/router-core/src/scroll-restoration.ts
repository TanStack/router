import { isServer } from '@tanstack/router-core/isServer'
import minifiedScrollRestorationScript from './scroll-restoration-inline?script-string'
import { escapeHtml, functionalUpdate } from './utils'
import type { AnyRouter } from './router'
import type { ParsedLocation } from './location'
import type { NonNullableUpdater } from './utils'
import type { HistoryLocation } from '@tanstack/history'

export type ScrollRestorationEntry = { scrollX: number; scrollY: number }

export type ScrollRestorationByElement = Record<string, ScrollRestorationEntry>

export type ScrollRestorationByKey = Record<string, ScrollRestorationByElement>

export type ScrollRestorationCache = {
  readonly state: ScrollRestorationByKey
  set: (updater: NonNullableUpdater<ScrollRestorationByKey>) => void
  persist: () => void
}

export type ScrollRestorationOptions = {
  getKey?: (location: ParsedLocation) => string
  scrollBehavior?: ScrollToOptions['behavior']
}

export type RestoreScrollOptions = {
  storageKey: string
  key?: string
  behavior?: ScrollToOptions['behavior']
  shouldScrollRestoration?: boolean
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
  location?: HistoryLocation
}

export type InlineScrollRestorationScriptOptions = Pick<
  RestoreScrollOptions,
  'storageKey' | 'key' | 'behavior' | 'shouldScrollRestoration'
>

function getSafeSessionStorage() {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.sessionStorage === 'object'
    ) {
      return window.sessionStorage
    }
  } catch {
    // silent
  }
  return undefined
}

// SessionStorage key used to store scroll positions across navigations.
export const storageKey = 'tsr-scroll-restoration-v1_3'

function readScrollRestorationState(
  key: string = storageKey,
): ScrollRestorationByKey {
  const safeSessionStorage = getSafeSessionStorage()

  if (!safeSessionStorage) {
    return {}
  }

  try {
    return JSON.parse(safeSessionStorage.getItem(key) || '{}')
  } catch {
    return {}
  }
}

function createScrollRestorationCache(): ScrollRestorationCache | null {
  const safeSessionStorage = getSafeSessionStorage()
  if (!safeSessionStorage) {
    return null
  }

  let state: ScrollRestorationByKey = readScrollRestorationState()

  const persist = () => {
    try {
      safeSessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      console.warn(
        '[ts-router] Could not persist scroll restoration state to sessionStorage.',
      )
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

const defaultInlineScrollRestorationScript = `(${minifiedScrollRestorationScript})(${escapeHtml(
  JSON.stringify({
    storageKey,
    shouldScrollRestoration: true,
  } satisfies InlineScrollRestorationScriptOptions),
)})`

export function getScrollRestorationScript(
  options: InlineScrollRestorationScriptOptions,
) {
  if (
    options.storageKey === storageKey &&
    options.shouldScrollRestoration === true &&
    options.key === undefined &&
    options.behavior === undefined
  ) {
    return defaultInlineScrollRestorationScript
  }

  return `(${minifiedScrollRestorationScript})(${escapeHtml(JSON.stringify(options))})`
}

export function getScrollRestorationScriptForRouter(router: AnyRouter) {
  if (typeof router.options.scrollRestoration === 'function') {
    const shouldRestore = router.options.scrollRestoration({
      location: router.latestLocation,
    })

    if (!shouldRestore) {
      return null
    }
  }

  const getKey =
    router.options.getScrollRestorationKey || defaultGetScrollRestorationKey
  const userKey = getKey(router.latestLocation)
  const defaultKey = defaultGetScrollRestorationKey(router.latestLocation)

  return getScrollRestorationScript({
    storageKey,
    shouldScrollRestoration: true,
    key: userKey !== defaultKey ? userKey : undefined,
  })
}

/**
 * The default `getKey` function for `useScrollRestoration`.
 * It returns the `key` from the location state or the `href` of the location.
 *
 * The `location.href` is used as a fallback to support the use case where the location state is not available like the initial render.
 */
export const defaultGetScrollRestorationKey = (location: ParsedLocation) => {
  return location.state.__TSR_key! || location.href
}

export function getCssSelector(el: any): string {
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

let ignoreScroll = false
const elementScrollRestorationSelectorCache = new WeakMap<Element, string>()

function restoreElementScroll(
  elementEntries: ScrollRestorationByElement | undefined,
  behavior: ScrollToOptions['behavior'] | undefined,
) {
  if (!elementEntries || Object.keys(elementEntries).length === 0) {
    return false
  }

  for (const elementSelector in elementEntries) {
    const entry = elementEntries[elementSelector]!

    if (elementSelector === 'window') {
      window.scrollTo({
        top: entry.scrollY,
        left: entry.scrollX,
        behavior,
      })
    } else if (elementSelector) {
      const element = document.querySelector(elementSelector)
      if (element) {
        element.scrollLeft = entry.scrollX
        element.scrollTop = entry.scrollY
      }
    }
  }

  return true
}

function scrollToHashOrTop({
  behavior,
  scrollToTopSelectors,
  location,
}: {
  behavior?: ScrollToOptions['behavior']
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
  location?: HistoryLocation
}) {
  const hash = (location ?? window.location).hash.split('#', 2)[1]

  if (hash) {
    const hashScrollIntoViewOptions =
      window.history.state?.__hashScrollIntoViewOptions ?? true

    if (hashScrollIntoViewOptions) {
      const el = document.getElementById(hash)
      if (el) {
        el.scrollIntoView(hashScrollIntoViewOptions)
      }
    }

    return
  }

  const scrollOptions = { top: 0, left: 0, behavior }
  window.scrollTo(scrollOptions)
  if (scrollToTopSelectors) {
    for (const selector of scrollToTopSelectors) {
      if (selector === 'window') continue
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

function restoreScrollFromEntries({
  elementEntries,
  behavior,
  shouldScrollRestoration,
  scrollToTopSelectors,
  location,
}: {
  elementEntries?: ScrollRestorationByElement
  behavior?: ScrollToOptions['behavior']
  shouldScrollRestoration?: boolean
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
  location?: HistoryLocation
}) {
  ignoreScroll = true

  try {
    if (
      shouldScrollRestoration &&
      restoreElementScroll(elementEntries, behavior)
    ) {
      return
    }

    scrollToHashOrTop({
      behavior,
      scrollToTopSelectors,
      location,
    })
  } finally {
    ignoreScroll = false
  }
}

function shouldClearCacheBeforeRestore(event: {
  fromLocation?: ParsedLocation
  toLocation: ParsedLocation
}) {
  const fromIndex = event.fromLocation?.state.__TSR_index
  const toIndex = event.toLocation.state.__TSR_index

  if (typeof fromIndex === 'number' && typeof toIndex === 'number') {
    return toIndex >= fromIndex
  }

  return true
}

function restoreScrollFromCache({
  key,
  behavior,
  shouldScrollRestoration,
  scrollToTopSelectors,
  location,
}: {
  key?: string
  behavior?: ScrollToOptions['behavior']
  shouldScrollRestoration?: boolean
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
  location?: HistoryLocation
}) {
  const resolvedKey = key || window.history.state?.__TSR_key
  const elementEntries = resolvedKey
    ? scrollRestorationCache?.state[resolvedKey]
    : undefined

  restoreScrollFromEntries({
    elementEntries,
    behavior,
    shouldScrollRestoration,
    scrollToTopSelectors,
    location,
  })
}

export function restoreScroll({
  storageKey,
  key,
  behavior,
  shouldScrollRestoration,
  scrollToTopSelectors,
  location,
}: RestoreScrollOptions) {
  let byKey: ScrollRestorationByKey

  try {
    byKey = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
  } catch (error) {
    console.error(error)
    return
  }

  const resolvedKey = key || window.history.state?.__TSR_key
  const elementEntries = resolvedKey ? byKey[resolvedKey] : undefined

  restoreScrollFromEntries({
    elementEntries,
    behavior,
    shouldScrollRestoration,
    scrollToTopSelectors,
    location,
  })
}

export function setupScrollRestoration(router: AnyRouter, force?: boolean) {
  if (!scrollRestorationCache && !(isServer ?? router.isServer)) {
    return
  }

  const shouldScrollRestoration =
    force ?? router.options.scrollRestoration ?? false

  if (shouldScrollRestoration) {
    router.isScrollRestoring = true
  }

  if (
    (isServer ?? router.isServer) ||
    router.isScrollRestorationSetup ||
    !scrollRestorationCache
  ) {
    return
  }

  router.isScrollRestorationSetup = true
  ignoreScroll = false

  const getKey =
    router.options.getScrollRestorationKey || defaultGetScrollRestorationKey

  window.history.scrollRestoration = 'manual'

  const onScroll = (event: Event) => {
    if (ignoreScroll || !router.isScrollRestoring) {
      return
    }

    let elementSelector = ''
    let scrollX = 0
    let scrollY = 0

    if (event.target === document || event.target === window) {
      elementSelector = 'window'
      scrollX = window.scrollX || 0
      scrollY = window.scrollY || 0
    } else {
      const target = event.target as Element
      const attrId = target.getAttribute('data-scroll-restoration-id')

      if (attrId) {
        elementSelector = `[data-scroll-restoration-id="${attrId}"]`
      } else {
        const cachedSelector = elementScrollRestorationSelectorCache.get(target)

        if (cachedSelector) {
          elementSelector = cachedSelector
        } else {
          elementSelector = getCssSelector(target)
          elementScrollRestorationSelectorCache.set(target, elementSelector)
        }
      }

      scrollX = target.scrollLeft || 0
      scrollY = target.scrollTop || 0
    }

    const restoreKey = getKey(router.stores.location.state)
    const keyEntry = (scrollRestorationCache.state[restoreKey] ||=
      {} as ScrollRestorationByElement)
    const elementEntry = keyEntry[elementSelector]

    if (
      elementEntry &&
      elementEntry.scrollX === scrollX &&
      elementEntry.scrollY === scrollY
    ) {
      return
    }

    const nextElementEntry = (keyEntry[elementSelector] ||=
      {} as ScrollRestorationEntry)
    nextElementEntry.scrollX = scrollX
    nextElementEntry.scrollY = scrollY
  }

  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('pagehide', () => {
    scrollRestorationCache.persist()
  })

  router.subscribe('onRendered', (event) => {
    const cacheKey = getKey(event.toLocation)

    if (!router.resetNextScroll) {
      router.resetNextScroll = true
      return
    }

    if (typeof router.options.scrollRestoration === 'function') {
      const shouldRestore = router.options.scrollRestoration({
        location: router.latestLocation,
      })
      if (!shouldRestore) {
        return
      }
    }

    if (scrollRestorationCache && shouldClearCacheBeforeRestore(event)) {
      scrollRestorationCache.set((state) => {
        delete state[cacheKey]
        return state
      })
    }

    restoreScrollFromCache({
      key: cacheKey,
      behavior: router.options.scrollRestorationBehavior,
      shouldScrollRestoration: router.isScrollRestoring,
      scrollToTopSelectors: router.options.scrollToTopSelectors,
      location: router.history.location,
    })

    if (router.isScrollRestoring) {
      scrollRestorationCache.set((state) => {
        state[cacheKey] ||= {} as ScrollRestorationByElement
        return state
      })
    }
  })
}

/**
 * @private
 * Handles hash-based scrolling after navigation completes.
 * To be used in framework-specific <Transitioner> components during the onResolved event.
 *
 * Provides hash scrolling for programmatic navigation when default browser handling is prevented.
 * @param router The router instance containing current location and state
 */
export function handleHashScroll(router: AnyRouter) {
  if (typeof document !== 'undefined' && (document as any).querySelector) {
    const location = router.stores.location.state
    const hashScrollIntoViewOptions =
      location.state.__hashScrollIntoViewOptions ?? true

    if (hashScrollIntoViewOptions && location.hash !== '') {
      const el = document.getElementById(location.hash)
      if (el) {
        el.scrollIntoView(hashScrollIntoViewOptions)
      }
    }
  }
}
