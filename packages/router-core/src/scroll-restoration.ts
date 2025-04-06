import { functionalUpdate } from './utils'
import type { AnyRouter } from './router'
import type { ParsedLocation } from './location'
import type { NonNullableUpdater } from './utils'

export type ScrollRestorationEntry = { scrollX: number; scrollY: number }

export type ScrollRestorationByElement = Record<string, ScrollRestorationEntry>

export type ScrollRestorationByKey = Record<string, ScrollRestorationByElement>

export type ScrollRestorationCache = {
  state: ScrollRestorationByKey
  set: (updater: NonNullableUpdater<ScrollRestorationByKey>) => void
}
export type ScrollRestorationOptions = {
  getKey?: (location: ParsedLocation) => string
  scrollBehavior?: ScrollToOptions['behavior']
}

export const storageKey = 'tsr-scroll-restoration-v1_3'
let sessionsStorage = false
try {
  sessionsStorage =
    typeof window !== 'undefined' && typeof window.sessionStorage === 'object'
} catch {}
const throttle = (fn: (...args: Array<any>) => void, wait: number) => {
  let timeout: any
  return (...args: Array<any>) => {
    if (!timeout) {
      timeout = setTimeout(() => {
        fn(...args)
        timeout = null
      }, wait)
    }
  }
}
export const scrollRestorationCache: ScrollRestorationCache = sessionsStorage
  ? (() => {
      const state: ScrollRestorationByKey =
        JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') || {}

      return {
        state,
        // This setter is simply to make sure that we set the sessionStorage right
        // after the state is updated. It doesn't necessarily need to be a functional
        // update.
        set: (updater) => (
          (scrollRestorationCache.state =
            functionalUpdate(updater, scrollRestorationCache.state) ||
            scrollRestorationCache.state),
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify(scrollRestorationCache.state),
          )
        ),
      }
    })()
  : (undefined as any)
/**
 * The default `getKey` function for `useScrollRestoration`.
 * It returns the `key` from the location state or the `href` of the location.
 *
 * The `location.href` is used as a fallback to support the use case where the location state is not available like the initial render.
 */

export const defaultGetScrollRestorationKey = (location: ParsedLocation) => {
  return location.state.key! || location.href
}

export function getCssSelector(el: any): string {
  const path = []
  let parent
  while ((parent = el.parentNode)) {
    path.unshift(
      `${el.tagName}:nth-child(${([].indexOf as any).call(parent.children, el) + 1})`,
    )
    el = parent
  }
  return `${path.join(' > ')}`.toLowerCase()
}

let ignoreScroll = false

// NOTE: This function must remain pure and not use any outside variables
// unless they are passed in as arguments. Why? Because we need to be able to
// toString() it into a script tag to execute as early as possible in the browser
// during SSR. Additionally, we also call it from within the router lifecycle
export function restoreScroll(
  storageKey: string,
  key: string | undefined,
  behavior: ScrollToOptions['behavior'] | undefined,
  shouldScrollRestoration: boolean | undefined,
  scrollToTopSelectors: Array<string> | undefined,
) {
  let byKey: ScrollRestorationByKey

  try {
    byKey = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
  } catch (error: any) {
    console.error(error)
    return
  }

  const resolvedKey = key || window.history.state?.key
  const elementEntries = byKey[resolvedKey]

  //
  ignoreScroll = true

  //
  ;(() => {
    // If we have a cached entry for this location state,
    // we always need to prefer that over the hash scroll.
    if (shouldScrollRestoration && elementEntries) {
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

      return
    }

    // If we don't have a cached entry for the hash,
    // Which means we've never seen this location before,
    // we need to check if there is a hash in the URL.
    // If there is, we need to scroll it's ID into view.
    const hash = window.location.hash.split('#')[1]

    if (hash) {
      const hashScrollIntoViewOptions =
        (window.history.state || {}).__hashScrollIntoViewOptions ?? true

      if (hashScrollIntoViewOptions) {
        const el = document.getElementById(hash)
        if (el) {
          el.scrollIntoView(hashScrollIntoViewOptions)
        }
      }

      return
    }

    // If there is no cached entry for the hash and there is no hash in the URL,
    // we need to scroll to the top of the page for every scrollToTop element
    ;[
      'window',
      ...(scrollToTopSelectors?.filter((d) => d !== 'window') ?? []),
    ].forEach((selector) => {
      const element =
        selector === 'window' ? window : document.querySelector(selector)
      if (element) {
        element.scrollTo({
          top: 0,
          left: 0,
          behavior,
        })
      }
    })
  })()

  //
  ignoreScroll = false
}

export function setupScrollRestoration(router: AnyRouter, force?: boolean) {
  const shouldScrollRestoration =
    force ?? router.options.scrollRestoration ?? false

  if (shouldScrollRestoration) {
    router.isScrollRestoring = true
  }

  if (typeof document === 'undefined' || router.isScrollRestorationSetup) {
    return
  }

  router.isScrollRestorationSetup = true

  //
  ignoreScroll = false

  const getKey =
    router.options.getScrollRestorationKey || defaultGetScrollRestorationKey

  window.history.scrollRestoration = 'manual'

  // // Create a MutationObserver to monitor DOM changes
  // const mutationObserver = new MutationObserver(() => {
  //   ;ignoreScroll = true
  //   requestAnimationFrame(() => {
  //     ;ignoreScroll = false

  //     // Attempt to restore scroll position on each dom
  //     // mutation until the user scrolls. We do this
  //     // because dynamic content may come in at different
  //     // ticks after the initial render and we want to
  //     // keep up with that content as much as possible.
  //     // As soon as the user scrolls, we no longer need
  //     // to attempt router.
  //     // console.log('mutation observer restoreScroll')
  //     restoreScroll(
  //       storageKey,
  //       getKey(router.state.location),
  //       router.options.scrollRestorationBehavior,
  //     )
  //   })
  // })

  // const observeDom = () => {
  //   // Observe changes to the entire document
  //   mutationObserver.observe(document, {
  //     childList: true, // Detect added or removed child nodes
  //     subtree: true, // Monitor all descendants
  //     characterData: true, // Detect text content changes
  //   })
  // }

  // const unobserveDom = () => {
  //   mutationObserver.disconnect()
  // }

  // observeDom()

  const onScroll = (event: Event) => {
    // unobserveDom()

    if (ignoreScroll || !router.isScrollRestoring) {
      return
    }

    let elementSelector = ''

    if (event.target === document || event.target === window) {
      elementSelector = 'window'
    } else {
      const attrId = (event.target as Element).getAttribute(
        'data-scroll-restoration-id',
      )

      if (attrId) {
        elementSelector = `[data-scroll-restoration-id="${attrId}"]`
      } else {
        elementSelector = getCssSelector(event.target)
      }
    }

    const restoreKey = getKey(router.state.location)

    scrollRestorationCache.set((state) => {
      const keyEntry = (state[restoreKey] =
        state[restoreKey] || ({} as ScrollRestorationByElement))

      const elementEntry = (keyEntry[elementSelector] =
        keyEntry[elementSelector] || ({} as ScrollRestorationEntry))

      if (elementSelector === 'window') {
        elementEntry.scrollX = window.scrollX || 0
        elementEntry.scrollY = window.scrollY || 0
      } else if (elementSelector) {
        const element = document.querySelector(elementSelector)
        if (element) {
          elementEntry.scrollX = element.scrollLeft || 0
          elementEntry.scrollY = element.scrollTop || 0
        }
      }

      return state
    })
  }

  // Throttle the scroll event to avoid excessive updates
  if (typeof document !== 'undefined') {
    document.addEventListener('scroll', throttle(onScroll, 100), true)
  }

  router.subscribe('onRendered', (event) => {
    // unobserveDom()

    const cacheKey = getKey(event.toLocation)

    // If the user doesn't want to restore the scroll position,
    // we don't need to do anything.
    if (!router.resetNextScroll) {
      router.resetNextScroll = true
      return
    }

    restoreScroll(
      storageKey,
      cacheKey,
      router.options.scrollRestorationBehavior || undefined,
      router.isScrollRestoring || undefined,
      router.options.scrollToTopSelectors || undefined,
    )

    if (router.isScrollRestoring) {
      // Mark the location as having been seen
      scrollRestorationCache.set((state) => {
        state[cacheKey] = state[cacheKey] || ({} as ScrollRestorationByElement)

        return state
      })
    }
  })
}

/**
 * @internal
 * Handles hash-based scrolling after navigation completes.
 * To be used in framework-specific <Transitioner> components during the onResolved event.
 *
 * Provides hash scrolling for programmatic navigation when default browser handling is prevented.
 * @param router The router instance containing current location and state
 */
export function handleHashScroll(router: AnyRouter) {
  if (typeof document !== 'undefined' && (document as any).querySelector) {
    const hashScrollIntoViewOptions =
      router.state.location.state.__hashScrollIntoViewOptions ?? true

    if (hashScrollIntoViewOptions && router.state.location.hash !== '') {
      const el = document.getElementById(router.state.location.hash)
      if (el) {
        el.scrollIntoView(hashScrollIntoViewOptions)
      }
    }
  }
}
