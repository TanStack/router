// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

export interface RouterHistory {
  location: HistoryLocation
  subscribe: (cb: () => void) => () => void
  push: (path: string, state?: any) => void
  replace: (path: string, state?: any) => void
  go: (index: number) => void
  back: () => void
  forward: () => void
  createHref: (href: string) => string
  block: (blockerFn: BlockerFn) => () => void
  flush: () => void
}

export interface HistoryLocation extends ParsedPath {
  state: HistoryState
}

export interface ParsedPath {
  href: string
  pathname: string
  search: string
  hash: string
}

export interface HistoryState {
  key: string
  __tempLocation?: HistoryLocation
  __tempKey?: string
}

type BlockerFn = (retry: () => void, cancel: () => void) => void

const pushStateEvent = 'pushstate'
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
  getLocation: () => HistoryLocation
  subscriber: false | ((onUpdate: () => void) => () => void)
  pushState: (path: string, state: any, onUpdate: () => void) => void
  replaceState: (path: string, state: any, onUpdate: () => void) => void
  go: (n: number) => void
  back: () => void
  forward: () => void
  createHref: (path: string) => string
  flush?: () => void
}): RouterHistory {
  let location = opts.getLocation()
  let unsub = () => {}
  let subscribers = new Set<() => void>()
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

    if (!opts.subscriber) {
      onUpdate()
    }
  }

  const queueTask = (task: () => void) => {
    queue.push(task)
    tryFlush()
  }

  const onUpdate = () => {
    location = opts.getLocation()
    subscribers.forEach((subscriber) => subscriber())
  }

  return {
    get location() {
      return location
    },
    subscribe: (cb: () => void) => {
      if (subscribers.size === 0) {
        unsub =
          typeof opts.subscriber === 'function'
            ? opts.subscriber(onUpdate)
            : () => {}
      }
      subscribers.add(cb)

      return () => {
        subscribers.delete(cb)
        if (subscribers.size === 0) {
          unsub()
        }
      }
    },
    push: (path: string, state: any) => {
      assignKey(state)
      queueTask(() => {
        opts.pushState(path, state, onUpdate)
      })
    },
    replace: (path: string, state: any) => {
      assignKey(state)
      queueTask(() => {
        opts.replaceState(path, state, onUpdate)
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
    flush: () => opts.flush?.(),
  }
}

function assignKey(state: HistoryState) {
  state.key = createRandomKey()
  // if (state.__actualLocation) {
  //   state.__actualLocation.state = {
  //     ...state.__actualLocation.state,
  //     key,
  //   }
  // }
}

/**
 * Creates a history object that can be used to interact with the browser's
 * navigation. This is a lightweight API wrapping the browser's native methods.
 * It is designed to work with TanStack Router, but could be used as a standalone API as well.
 * IMPORTANT: This API implements history throttling via a microtask to prevent
 * excessive calls to the history API. In some browsers, calling history.pushState or
 * history.replaceState in quick succession can cause the browser to ignore subsequent
 * calls. This API smooths out those differences and ensures that your application
 * state will *eventually* match the browser state. In most cases, this is not a problem,
 * but if you need to ensure that the browser state is up to date, you can use the
 * `history.flush` method to immediately flush all pending state changes to the browser URL.
 * @param opts
 * @param opts.getHref A function that returns the current href (path + search + hash)
 * @param opts.createHref A function that takes a path and returns a href (path + search + hash)
 * @returns A history instance
 */
export function createBrowserHistory(opts?: {
  getHref?: () => string
  createHref?: (path: string) => string
}): RouterHistory {
  const getHref =
    opts?.getHref ??
    (() =>
      `${window.location.pathname}${window.location.search}${window.location.hash}`)

  const createHref = opts?.createHref ?? ((path) => path)

  let currentLocation = parseLocation(getHref(), window.history.state)

  const getLocation = () => currentLocation

  let next:
    | undefined
    | {
        // This is the latest location that we were attempting to push/replace
        href: string
        // This is the latest state that we were attempting to push/replace
        state: any
        // This is the latest type that we were attempting to push/replace
        isPush: boolean
      }

  // Because we are proactively updating the location
  // in memory before actually updating the browser history,
  // we need to track when we are doing this so we don't
  // notify subscribers twice on the last update.
  let tracking = true

  // We need to track the current scheduled update to prevent
  // multiple updates from being scheduled at the same time.
  let scheduled: Promise<void> | undefined

  // This function is a wrapper to prevent any of the callback's
  // side effects from causing a subscriber notification
  const untrack = (fn: () => void) => {
    tracking = false
    fn()
    tracking = true
  }

  // This function flushes the next update to the browser history
  const flush = () => {
    // Do not notify subscribers about this push/replace call
    untrack(() => {
      if (!next) return
      window.history[next.isPush ? 'pushState' : 'replaceState'](
        next.state,
        '',
        next.href,
      )
      // Reset the nextIsPush flag and clear the scheduled update
      next = undefined
      scheduled = undefined
    })
  }

  // This function queues up a call to update the browser history
  const queueHistoryAction = (
    type: 'push' | 'replace',
    path: string,
    state: any,
    onUpdate: () => void,
  ) => {
    const href = createHref(path)

    // Update the location in memory
    currentLocation = parseLocation(href, state)

    // Keep track of the next location we need to flush to the URL
    next = {
      href,
      state,
      isPush: next?.isPush || type === 'push',
    }
    // Notify subscribers
    onUpdate()

    if (!scheduled) {
      // Schedule an update to the browser history
      scheduled = Promise.resolve().then(() => flush())
    }
  }

  return createHistory({
    getLocation,
    subscriber: (onUpdate) => {
      window.addEventListener(pushStateEvent, () => {
        currentLocation = parseLocation(getHref(), window.history.state)
        onUpdate()
      })
      window.addEventListener(popStateEvent, () => {
        currentLocation = parseLocation(getHref(), window.history.state)
        onUpdate()
      })

      var pushState = window.history.pushState
      window.history.pushState = function () {
        let res = pushState.apply(history, arguments as any)
        if (tracking) onUpdate()
        return res
      }
      var replaceState = window.history.replaceState
      window.history.replaceState = function () {
        let res = replaceState.apply(history, arguments as any)
        if (tracking) onUpdate()
        return res
      }

      return () => {
        window.history.pushState = pushState
        window.history.replaceState = replaceState
        window.removeEventListener(pushStateEvent, onUpdate)
        window.removeEventListener(popStateEvent, onUpdate)
      }
    },
    pushState: (path, state, onUpdate) =>
      queueHistoryAction('push', path, state, onUpdate),
    replaceState: (path, state, onUpdate) =>
      queueHistoryAction('replace', path, state, onUpdate),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    go: (n) => window.history.go(n),
    createHref: (path) => createHref(path),
    flush,
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
  let currentState = {
    key: createRandomKey(),
  } as HistoryState

  const getLocation = () => parseLocation(entries[index]!, currentState)

  return createHistory({
    getLocation,
    subscriber: false,
    pushState: (path, state) => {
      currentState = state
      entries.push(path)
      index++
    },
    replaceState: (path, state) => {
      currentState = state
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

function parseLocation(href: string, state: HistoryState): HistoryLocation {
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
    hash: hashIndex > -1 ? href.substring(hashIndex) : '',
    search:
      searchIndex > -1
        ? href.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
        : '',
    state: state || {},
  }
}

// Thanks co-pilot!
function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7)
}
