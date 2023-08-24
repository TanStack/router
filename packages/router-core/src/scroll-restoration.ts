import { AnyRouter, ParsedLocation } from './router'

const windowKey = 'window'
const delimiter = '___'

let weakScrolledElementsByRestoreKey: Record<string, WeakSet<any>> = {}

type CacheValue = Record<string, { scrollX: number; scrollY: number }>

type Cache = {
  current: CacheValue
  set: (key: string, value: any) => void
}

let cache: Cache

let pathDidChange = false

const sessionsStorage = typeof window !== 'undefined' && window.sessionStorage

export type ScrollRestorationOptions = {
  getKey?: (location: ParsedLocation) => string
}

const defaultGetKey = (location: ParsedLocation) => location.key!

export function watchScrollPositions(
  router: AnyRouter,
  opts?: ScrollRestorationOptions,
) {
  const getKey = opts?.getKey || defaultGetKey

  if (sessionsStorage) {
    if (!cache) {
      cache = (() => {
        const storageKey = 'tsr-scroll-restoration-v1'

        const current: CacheValue = JSON.parse(
          window.sessionStorage.getItem(storageKey) || '{}',
        )

        return {
          current,
          set: (key: string, value: any) => {
            current[key] = value
            window.sessionStorage.setItem(storageKey, JSON.stringify(cache))
          },
        }
      })()
    }
  }

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
    pathDidChange = true
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
}

export function restoreScrollPositions(
  router: AnyRouter,
  opts?: ScrollRestorationOptions,
) {
  if (pathDidChange) {
    const getKey = opts?.getKey || defaultGetKey

    pathDidChange = false

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
}
