import * as React from 'react'
import { functionalUpdate } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { NonNullableUpdater, ParsedLocation } from '@tanstack/router-core'

const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

const windowKey = 'window'
const delimiter = '___'

let weakScrolledElements = new WeakSet<any>()

type CacheValue = Record<string, { scrollX: number; scrollY: number }>
type CacheState = {
  cached: CacheValue
  next: CacheValue
}

type Cache = {
  state: CacheState
  set: (updater: NonNullableUpdater<CacheState>) => void
}

const sessionsStorage = typeof window !== 'undefined' && window.sessionStorage

const cache: Cache = sessionsStorage
  ? (() => {
      const storageKey = 'tsr-scroll-restoration-v2'

      const state: CacheState = JSON.parse(
        window.sessionStorage.getItem(storageKey) || 'null',
      ) || { cached: {}, next: {} }

      return {
        state,
        set: (updater) => {
          cache.state = functionalUpdate(updater, cache.state)
          window.sessionStorage.setItem(storageKey, JSON.stringify(cache.state))
        },
      }
    })()
  : (undefined as any)

export type ScrollRestorationOptions = {
  getKey?: (location: ParsedLocation) => string
  scrollBehavior?: ScrollToOptions['behavior']
}

/**
 * The default `getKey` function for `useScrollRestoration`.
 * It returns the `key` from the location state or the `href` of the location.
 *
 * The `location.href` is used as a fallback to support the use case where the location state is not available like the initial render.
 */
const defaultGetKey = (location: ParsedLocation) => {
  return location.state.key! || location.href
}

export function useScrollRestoration(options?: ScrollRestorationOptions) {
  const router = useRouter()

  useLayoutEffect(() => {
    const getKey = options?.getKey || defaultGetKey

    const { history } = window
    history.scrollRestoration = 'manual'

    const onScroll = (event: Event) => {
      if (weakScrolledElements.has(event.target)) return
      weakScrolledElements.add(event.target)

      let elementSelector = ''

      if (event.target === document || event.target === window) {
        elementSelector = windowKey
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

      if (!cache.state.next[elementSelector]) {
        cache.set((c) => ({
          ...c,
          next: {
            ...c.next,
            [elementSelector]: {
              scrollX: NaN,
              scrollY: NaN,
            },
          },
        }))
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('scroll', onScroll, true)
    }

    const unsubOnBeforeLoad = router.subscribe('onBeforeLoad', (event) => {
      if (event.hrefChanged) {
        const restoreKey = getKey(event.fromLocation)
        for (const elementSelector in cache.state.next) {
          const entry = cache.state.next[elementSelector]!
          if (elementSelector === windowKey) {
            entry.scrollX = window.scrollX || 0
            entry.scrollY = window.scrollY || 0
          } else if (elementSelector) {
            const element = document.querySelector(elementSelector)
            entry.scrollX = element?.scrollLeft || 0
            entry.scrollY = element?.scrollTop || 0
          }

          cache.set((c) => {
            const next = { ...c.next }
            delete next[elementSelector]

            return {
              ...c,
              next,
              cached: {
                ...c.cached,
                [[restoreKey, elementSelector].join(delimiter)]: entry,
              },
            }
          })
        }
      }
    })

    const unsubOnBeforeRouteMount = router.subscribe(
      'onBeforeRouteMount',
      (event) => {
        if (event.hrefChanged) {
          if (!router.resetNextScroll) {
            return
          }

          router.resetNextScroll = true

          const restoreKey = getKey(event.toLocation)
          let windowRestored = false

          for (const cacheKey in cache.state.cached) {
            const entry = cache.state.cached[cacheKey]!
            const [key, elementSelector] = cacheKey.split(delimiter)
            if (key === restoreKey) {
              if (elementSelector === windowKey) {
                windowRestored = true
                window.scrollTo({
                  top: entry.scrollY,
                  left: entry.scrollX,
                  behavior: options?.scrollBehavior,
                })
              } else if (elementSelector) {
                const element = document.querySelector(elementSelector)
                if (element) {
                  element.scrollLeft = entry.scrollX
                  element.scrollTop = entry.scrollY
                }
              }
            }
          }

          if (!windowRestored) {
            window.scrollTo(0, 0)
          }

          cache.set((c) => ({ ...c, next: {} }))
          weakScrolledElements = new WeakSet<any>()
        }
      },
    )

    return () => {
      document.removeEventListener('scroll', onScroll)
      unsubOnBeforeLoad()
      unsubOnBeforeRouteMount()
    }
  }, [options?.getKey, options?.scrollBehavior, router])
}

export function ScrollRestoration(props: ScrollRestorationOptions) {
  useScrollRestoration(props)
  return null
}

export function useElementScrollRestoration(
  options: (
    | {
        id: string
        getElement?: () => Element | undefined | null
      }
    | {
        id?: string
        getElement: () => Element | undefined | null
      }
  ) & {
    getKey?: (location: ParsedLocation) => string
  },
) {
  const router = useRouter()
  const getKey = options.getKey || defaultGetKey

  let elementSelector = ''

  if (options.id) {
    elementSelector = `[data-scroll-restoration-id="${options.id}"]`
  } else {
    const element = options.getElement?.()
    if (!element) {
      return
    }
    elementSelector = getCssSelector(element)
  }

  const restoreKey = getKey(router.latestLocation)
  const cacheKey = [restoreKey, elementSelector].join(delimiter)
  return cache.state.cached[cacheKey]
}

function getCssSelector(el: any): string {
  const path = []
  let parent
  while ((parent = el.parentNode)) {
    path.unshift(
      `${el.tagName}:nth-child(${
        ([].indexOf as any).call(parent.children, el) + 1
      })`,
    )
    el = parent
  }
  return `${path.join(' > ')}`.toLowerCase()
}
