import * as React from 'react'
import { ParsedLocation, useRouter } from '.'

const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

const windowKey = 'window'
const delimiter = '___'

let weakScrolledElementsByRestoreKey: Record<string, WeakSet<any>> = {}

const cache = (() => {
  if (typeof window === 'undefined') {
    return {
      set: () => {},
      get: () => {},
    } as never
  }

  const storageKey = 'tsr-scroll-restoration-v1'

  let cache = JSON.parse(window.sessionStorage.getItem(storageKey) || '{}')

  return {
    current: cache,
    set: (key: string, value: any) => {
      cache[key] = value
      window.sessionStorage.setItem(storageKey, JSON.stringify(cache))
    },
  }
})()

export function ScrollRestoration() {
  const router = useRouter()
  const getKey = (location: ParsedLocation) => location.key as string

  const pathDidChangeRef = React.useRef(false)

  const restoreScrollPositions = () => {
    const restoreKey = getKey(router.state.location)
    let windowRestored = false

    for (const cacheKey in cache.current) {
      const entry = cache.current[cacheKey]!
      const [key, elementSelector] = cacheKey.split(delimiter)
      if (key === restoreKey) {
        if (elementSelector === windowKey) {
          windowRestored = true
          window.scrollTo(entry.scrollX, entry.scrollY)
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
  }

  useLayoutEffect(() => {
    const { history } = window
    if (history.scrollRestoration) {
      history.scrollRestoration = 'manual'
    }

    const onScroll = (event: Event) => {
      const restoreKey = getKey(router.state.resolvedLocation)

      if (!weakScrolledElementsByRestoreKey[restoreKey]) {
        weakScrolledElementsByRestoreKey[restoreKey] = new WeakSet()
      }

      const set = weakScrolledElementsByRestoreKey[restoreKey]!

      if (set.has(event.target)) return
      set.add(event.target)

      const cacheKey = [
        restoreKey,
        event.target === document || event.target === window
          ? windowKey
          : getCssSelector(event.target),
      ].join(delimiter)

      if (!cache.current[cacheKey]) {
        cache.set(cacheKey, {
          scrollX: NaN,
          scrollY: NaN,
        })
      }
    }

    const getCssSelector = (el: any): string => {
      let path = [],
        parent
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

    const onPathWillChange = (from: ParsedLocation) => {
      const restoreKey = getKey(from)
      for (const cacheKey in cache.current) {
        const entry = cache.current[cacheKey]!
        const [key, elementSelector] = cacheKey.split(delimiter)
        if (restoreKey === key) {
          if (elementSelector === windowKey) {
            entry.scrollX = window.scrollX || 0
            entry.scrollY = window.scrollY || 0
          } else if (elementSelector) {
            const element = document.querySelector(elementSelector)
            entry.scrollX = element?.scrollLeft || 0
            entry.scrollY = element?.scrollTop || 0
          }

          cache.set(cacheKey, entry)
        }
      }
    }

    const onPathChange = () => {
      pathDidChangeRef.current = true
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('scroll', onScroll, true)
    }

    const unsubOnBeforeLoad = router.subscribe('onBeforeLoad', (event) => {
      if (event.pathChanged) onPathWillChange(event.from)
    })

    const unsubOnLoad = router.subscribe('onLoad', (event) => {
      if (event.pathChanged) onPathChange()
    })

    return () => {
      document.removeEventListener('scroll', onScroll)
      unsubOnBeforeLoad()
      unsubOnLoad()
    }
  }, [])

  useLayoutEffect(() => {
    if (pathDidChangeRef.current) {
      pathDidChangeRef.current = false
      restoreScrollPositions()
    }
  })

  return null
}
