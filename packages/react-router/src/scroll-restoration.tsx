import * as React from 'react'
import { functionalUpdate } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { warning } from '.'
import type { NonNullableUpdater, ParsedLocation } from '@tanstack/router-core'

const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

type ScrollRestorationEntry = { scrollX: number; scrollY: number }

type ScrollRestorationByElement = Record<string, ScrollRestorationEntry>

type ScrollRestorationByKey = Record<string, ScrollRestorationByElement>

type Cache = {
  state: ScrollRestorationByKey
  set: (updater: NonNullableUpdater<ScrollRestorationByKey>) => void
}

const storageKey = 'tsr-scroll-restoration-v3'
const sessionsStorage = typeof window !== 'undefined' && window.sessionStorage

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

const cache: Cache = sessionsStorage
  ? (() => {
      const state: ScrollRestorationByKey =
        JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') || {}

      return {
        state,
        // This setter is simply to make sure that we set the sessionStorage right
        // after the state is updated. It doesn't necessarily need to be a functional
        // update.
        set: (updater) => (
          (cache.state =
            (functionalUpdate(updater, cache.state) as any) || cache.state),
          window.sessionStorage.setItem(storageKey, JSON.stringify(cache.state))
        ),
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

function restoreScroll(
  storageKey: string,
  key?: string,
  behavior?: ScrollToOptions['behavior'],
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

  if (!elementEntries) return

  let windowRestored = false

  for (const elementSelector in elementEntries) {
    const entry = elementEntries[elementSelector]!
    if (elementSelector === 'window') {
      windowRestored = true
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

  if (!windowRestored) {
    window.scrollTo(0, 0)
  }
}

function useScrollRestoration(options?: ScrollRestorationOptions) {
  const router = useRouter()

  useLayoutEffect(() => {
    const getKey = options?.getKey || defaultGetKey

    const { history } = window
    history.scrollRestoration = 'manual'

    let isMutationScroll = false

    // Create a MutationObserver to monitor DOM changes
    const mutationObserver = new MutationObserver(() => {
      isMutationScroll = true
      requestAnimationFrame(() => {
        isMutationScroll = false
      })
    })

    // Observe changes to the entire document
    mutationObserver.observe(document, {
      childList: true, // Detect added or removed child nodes
      subtree: true, // Monitor all descendants
      characterData: true, // Detect text content changes
    })

    const onScroll = (event: Event) => {
      if (isMutationScroll) {
        isMutationScroll = false
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

      const restoreKey = getKey(router.state.resolvedLocation)

      cache.set((state) => {
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
      document.addEventListener('scroll', onScroll, true)
    }

    const unsubOnResolved = router.subscribe('onRendered', (event) => {
      if (!router.resetNextScroll) {
        return
      }

      router.resetNextScroll = true
      restoreScroll(
        storageKey,
        getKey(event.toLocation),
        options?.scrollBehavior,
      )
    })

    restoreScroll(
      storageKey,
      getKey(router.latestLocation),
      options?.scrollBehavior,
    )

    return () => {
      mutationObserver.disconnect()
      document.removeEventListener('scroll', throttle(onScroll, 100))
      unsubOnResolved()
    }
  }, [options?.getKey, options?.scrollBehavior, router])
}

export function ScrollRestoration(props: ScrollRestorationOptions) {
  const router = useRouter()
  useScrollRestoration(props)

  // if (!router.) {
  //   return <script suppressHydrationWarning />
  // }

  const getKey = props.getKey || defaultGetKey
  const userKey = getKey(router.latestLocation)
  const resolvedKey =
    userKey !== defaultGetKey(router.latestLocation) ? userKey : null

  return (
    <script
      // className="tsr-once"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(${restoreScroll.toString()})(${JSON.stringify(storageKey)},${JSON.stringify(resolvedKey)});__TSR__.cleanScripts()`,
      }}
    />
    // <ScriptOnce
    //   children={`(${restoreScroll.toString()})(${JSON.stringify(storageKey)},${JSON.stringify(resolvedKey)})`}
    // />
  )
}

export function useElementScrollRestoration() {
  warning(false, 'useElementScrollRestoration has been deprecated')
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
