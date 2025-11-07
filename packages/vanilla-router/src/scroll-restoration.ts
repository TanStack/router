import type { AnyRouter, ParsedLocation, ScrollRestorationEntry } from '@tanstack/router-core'
import {
  defaultGetScrollRestorationKey,
  getCssSelector,
  scrollRestorationCache,
  setupScrollRestoration,
} from '@tanstack/router-core'

/**
 * Setup scroll restoration for the router
 * This is typically called automatically when scrollRestoration: true is set in router options
 * But can be called manually if needed
 * 
 * @param router - The router instance
 * @param force - Force setup even if scrollRestoration is false in options
 */
export function setupScrollRestorationUtil<TRouter extends AnyRouter>(
  router: TRouter,
  force?: boolean,
): void {
  setupScrollRestoration(router, force)
}

/**
 * Get scroll position for a specific element or window
 * This is a vanilla JS equivalent of useElementScrollRestoration hook
 * 
 * @param router - The router instance
 * @param options - Options for getting scroll position
 * @param options.id - Unique ID for the element (must match data-scroll-restoration-id attribute)
 * @param options.getElement - Function that returns the element to get scroll position for
 * @param options.getKey - Optional function to get the cache key (defaults to location.href)
 * @returns Scroll restoration entry with scrollX and scrollY, or undefined if not found
 */
export function getScrollPosition<TRouter extends AnyRouter>(
  router: TRouter,
  options: {
    id?: string
    getElement?: () => Window | Element | undefined | null
    getKey?: (location: ParsedLocation) => string
  },
): ScrollRestorationEntry | undefined {
  if (!scrollRestorationCache) return undefined

  const getKey = options.getKey || defaultGetScrollRestorationKey
  const restoreKey = getKey(router.latestLocation)
  const byKey = scrollRestorationCache.state[restoreKey]

  if (!byKey) return undefined

  let elementSelector = ''

  if (options.id) {
    elementSelector = `[data-scroll-restoration-id="${options.id}"]`
  } else {
    const element = options.getElement?.()
    if (!element) {
      return undefined
    }
    elementSelector =
      element instanceof Window ? 'window' : getCssSelector(element)
  }

  return byKey[elementSelector]
}

/**
 * Save scroll position for a specific element or window
 * This is typically handled automatically by setupScrollRestoration
 * But can be called manually if needed
 * 
 * @param router - The router instance
 * @param options - Options for saving scroll position
 * @param options.id - Unique ID for the element (must match data-scroll-restoration-id attribute)
 * @param options.getElement - Function that returns the element to save scroll position for
 * @param options.getKey - Optional function to get the cache key (defaults to location.href)
 */
export function saveScrollPosition<TRouter extends AnyRouter>(
  router: TRouter,
  options: {
    id?: string
    getElement?: () => Window | Element | undefined | null
    getKey?: (location: ParsedLocation) => string
  },
): void {
  if (!scrollRestorationCache) return

  const getKey = options.getKey || defaultGetScrollRestorationKey
  const restoreKey = getKey(router.latestLocation)

  let elementSelector = ''

  if (options.id) {
    elementSelector = `[data-scroll-restoration-id="${options.id}"]`
  } else {
    const element = options.getElement?.()
    if (!element) {
      return
    }
    elementSelector =
      element instanceof Window ? 'window' : getCssSelector(element)
  }

  scrollRestorationCache.set((state) => {
    const keyEntry = (state[restoreKey] ||= {} as any)

    const elementEntry = (keyEntry[elementSelector] ||= {} as ScrollRestorationEntry)

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

