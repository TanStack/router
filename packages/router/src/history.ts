// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

export interface RouterHistory {
  location: RouterLocation
  listen: (cb: () => void) => () => void
  push: (path: string, state: any) => void
  replace: (path: string, state: any) => void
  go: (index: number) => void
  back: () => void
  forward: () => void
  createHref: (href: string) => string
  block: (blockerFn: BlockerFn) => () => void
}

export interface ParsedPath {
  href: string
  pathname: string
  search: string
  hash: string
}

export interface RouterLocation extends ParsedPath {
  state: any
}

type BlockerFn = (retry: () => void, cancel: () => void) => void

const popStateEvent = 'popstate'
const beforeUnloadEvent = 'beforeunload'

const beforeUnloadListener = (event: Event) => {
  event.preventDefault()
  // @ts-ignore
  return (event.returnValue = '')
}

const stopBlocking = () => {
  removeEventListener(beforeUnloadEvent, beforeUnloadListener, {
    capture: true,
  })
}

function createHistory(opts: {
  getLocation: () => RouterLocation
  listener: (onUpdate: () => void) => () => void
  pushState: (path: string, state: any) => void
  replaceState: (path: string, state: any) => void
  go: (n: number) => void
  back: () => void
  forward: () => void
  createHref: (path: string) => string
}): RouterHistory {
  let currentLocation = opts.getLocation()
  let unsub = () => {}
  let listeners = new Set<() => void>()
  let blockers: BlockerFn[] = []
  let queue: (() => void)[] = []

  const tryFlush = () => {
    if (blockers.length) {
      blockers[0]?.(tryFlush, () => {
        blockers = []
        stopBlocking()
      })
      return
    }

    while (queue.length) {
      queue.shift()?.()
    }

    onUpdate()
  }

  const queueTask = (task: () => void) => {
    queue.push(task)
    tryFlush()
  }

  const onUpdate = () => {
    currentLocation = opts.getLocation()
    listeners.forEach((listener) => listener())
  }

  return {
    get location() {
      return currentLocation
    },
    listen: (cb: () => void) => {
      if (listeners.size === 0) {
        unsub = opts.listener(onUpdate)
      }
      listeners.add(cb)

      return () => {
        listeners.delete(cb)
        if (listeners.size === 0) {
          unsub()
        }
      }
    },
    push: (path: string, state: any) => {
      queueTask(() => {
        opts.pushState(path, state)
      })
    },
    replace: (path: string, state: any) => {
      queueTask(() => {
        opts.replaceState(path, state)
      })
    },
    go: (index) => {
      queueTask(() => {
        opts.go(index)
      })
    },
    back: () => {
      queueTask(() => {
        opts.back()
      })
    },
    forward: () => {
      queueTask(() => {
        opts.forward()
      })
    },
    createHref: (str) => opts.createHref(str),
    block: (cb) => {
      blockers.push(cb)

      if (blockers.length === 1) {
        addEventListener(beforeUnloadEvent, beforeUnloadListener, {
          capture: true,
        })
      }

      return () => {
        blockers = blockers.filter((b) => b !== cb)

        if (!blockers.length) {
          stopBlocking()
        }
      }
    },
  }
}

export function createBrowserHistory(opts?: {
  getHref?: () => string
  createHref?: (path: string) => string
}): RouterHistory {
  const getHref =
    opts?.getHref ??
    (() =>
      `${window.location.pathname}${window.location.hash}${window.location.search}`)
  const createHref = opts?.createHref ?? ((path) => path)
  const getLocation = () => parseLocation(getHref(), history.state)

  return createHistory({
    getLocation,
    listener: (onUpdate) => {
      window.addEventListener(popStateEvent, onUpdate)
      return () => {
        window.removeEventListener(popStateEvent, onUpdate)
      }
    },
    pushState: (path, state) => {
      window.history.pushState(
        { ...state, key: createRandomKey() },
        '',
        createHref(path),
      )
    },
    replaceState: (path, state) => {
      window.history.replaceState(
        { ...state, key: createRandomKey() },
        '',
        createHref(path),
      )
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    go: (n) => window.history.go(n),
    createHref: (path) => createHref(path),
  })
}

export function createHashHistory(): RouterHistory {
  return createBrowserHistory({
    getHref: () => window.location.hash.substring(1),
    createHref: (path) => `#${path}`,
  })
}

export function createMemoryHistory(
  opts: {
    initialEntries: string[]
    initialIndex?: number
  } = {
    initialEntries: ['/'],
  },
): RouterHistory {
  const entries = opts.initialEntries
  let index = opts.initialIndex ?? entries.length - 1
  let currentState = {}

  const getLocation = () => parseLocation(entries[index]!, currentState)

  return createHistory({
    getLocation,
    listener: () => {
      return () => {}
    },
    pushState: (path, state) => {
      currentState = {
        ...state,
        key: createRandomKey(),
      }
      entries.push(path)
      index++
    },
    replaceState: (path, state) => {
      currentState = {
        ...state,
        key: createRandomKey(),
      }
      entries[index] = path
    },
    back: () => {
      index--
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
    },
    go: (n) => window.history.go(n),
    createHref: (path) => path,
  })
}

function parseLocation(href: string, state: any): RouterLocation {
  let hashIndex = href.indexOf('#')
  let searchIndex = href.indexOf('?')

  return {
    href,
    pathname: href.substring(
      0,
      hashIndex > 0
        ? searchIndex > 0
          ? Math.min(hashIndex, searchIndex)
          : hashIndex
        : searchIndex > 0
        ? searchIndex
        : href.length,
    ),
    hash: hashIndex > -1 ? href.substring(hashIndex, searchIndex) : '',
    search: searchIndex > -1 ? href.substring(searchIndex) : '',
    state,
  }
}

// Thanks co-pilot!
function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7)
}
