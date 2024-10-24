// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

export interface NavigateOptions {
  ignoreBlocker?: boolean
}

export interface RouterHistory {
  location: HistoryLocation
  length: number
  subscribers: Set<() => void>
  subscribe: (cb: () => void) => () => void
  push: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  replace: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  go: (index: number, navigateOpts?: NavigateOptions) => void
  back: (navigateOpts?: NavigateOptions) => void
  forward: (navigateOpts?: NavigateOptions) => void
  createHref: (href: string) => string
  block: (blocker: NavigationBlocker) => () => void
  flush: () => void
  destroy: () => void
  notify: () => void
  _ignoreSubscribers?: boolean
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
  key?: string
}

type ShouldAllowNavigation = any

export type HistoryAction = 'PUSH' | 'POP' | 'REPLACE'
export type BlockerFnArgs = {
  currentLocation: HistoryLocation
  nextLocation: HistoryLocation
  action: HistoryAction
}

export type BlockerFn = (
  args: BlockerFnArgs,
) => Promise<ShouldAllowNavigation> | ShouldAllowNavigation

export type NavigationBlocker = {
  blockerFn: BlockerFn
  disableBeforeUnload?: (() => boolean) | boolean
}

type TryNavigateArgs = {
  task: () => void
  type: HistoryAction
  navigateOpts?: NavigateOptions
} & (
  | {
      type: 'PUSH' | 'REPLACE'
      path: string
      state: any
    }
  | {
      type: 'POP'
    }
)

type WinType = typeof window & { blockers?: Array<NavigationBlocker> }

const pushStateEvent = 'pushstate'
const popStateEvent = 'popstate'
const beforeUnloadEvent = 'beforeunload'

export function createHistory(opts: {
  getLocation: () => HistoryLocation
  getLength: () => number
  pushState: (path: string, state: any) => void
  replaceState: (path: string, state: any) => void
  go: (n: number) => void
  back: (ignoreBlocker: boolean) => void
  forward: (ignoreBlocker: boolean) => void
  createHref: (path: string) => string
  flush?: () => void
  destroy?: () => void
  onBlocked?: (onUpdate: () => void) => void
  win?: WinType
}): RouterHistory {
  let location = opts.getLocation()
  const subscribers = new Set<() => void>()

  const notify = () => {
    location = opts.getLocation()
    subscribers.forEach((subscriber) => subscriber())
  }

  const tryNavigation = async ({
    task,
    navigateOpts,
    ...actionInfo
  }: TryNavigateArgs) => {
    const ignoreBlocker = navigateOpts?.ignoreBlocker ?? false
    if (ignoreBlocker) {
      task()
      return
    }

    const blockers = opts.win?.blockers ?? []
    if (
      typeof document !== 'undefined' &&
      blockers.length &&
      actionInfo.type !== 'POP'
    ) {
      for (const blocker of blockers) {
        const nextLocation = parseHref(actionInfo.path, actionInfo.state)
        const isBlocked = await blocker.blockerFn({
          currentLocation: location,
          nextLocation,
          action: actionInfo.type,
        })
        if (isBlocked) {
          opts.onBlocked?.(notify)
          return
        }
      }
    }

    task()
  }

  return {
    get location() {
      return location
    },
    get length() {
      return opts.getLength()
    },
    subscribers,
    subscribe: (cb: () => void) => {
      subscribers.add(cb)

      return () => {
        subscribers.delete(cb)
      }
    },
    push: (path, state, navigateOpts) => {
      state = assignKey(state)
      tryNavigation({
        task: () => {
          opts.pushState(path, state)
          notify()
        },
        navigateOpts,
        type: 'PUSH',
        path,
        state,
      })
    },
    replace: (path, state, navigateOpts) => {
      state = assignKey(state)
      tryNavigation({
        task: () => {
          opts.replaceState(path, state)
          notify()
        },
        navigateOpts,
        type: 'REPLACE',
        path,
        state,
      })
    },
    go: (index, navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.go(index)
          notify()
        },
        navigateOpts,
        type: 'POP',
      })
    },
    back: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.back(navigateOpts?.ignoreBlocker ?? false)
          notify()
        },
        navigateOpts,
        type: 'POP',
      })
    },
    forward: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.forward(navigateOpts?.ignoreBlocker ?? false)
          notify()
        },
        navigateOpts,
        type: 'POP',
      })
    },
    createHref: (str) => opts.createHref(str),
    block: (blocker) => {
      if (!opts.win) return () => {}
      if (!opts.win.blockers) opts.win.blockers = []
      opts.win.blockers.push(blocker)

      return () => {
        if (!opts.win) return
        opts.win.blockers = opts.win.blockers?.filter((b) => b !== blocker)
      }
    },
    flush: () => opts.flush?.(),
    destroy: () => opts.destroy?.(),
    notify,
  }
}

function assignKey(state: HistoryState | undefined) {
  if (!state) {
    state = {} as HistoryState
  }
  return {
    ...state,
    key: createRandomKey(),
  }
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
  parseLocation?: () => HistoryLocation
  createHref?: (path: string) => string
  window?: any
}): RouterHistory {
  const win: WinType =
    opts?.window ?? (typeof document !== 'undefined' ? window : ({} as WinType))
  win.blockers = []

  const originalPushState = win.history.pushState
  const originalReplaceState = win.history.replaceState

  const createHref = opts?.createHref ?? ((path) => path)
  const parseLocation =
    opts?.parseLocation ??
    (() =>
      parseHref(
        `${win.location.pathname}${win.location.search}${win.location.hash}`,
        win.history.state,
      ))

  let currentLocation = parseLocation()
  let rollbackLocation: HistoryLocation | undefined

  let ignoreNextPop = false
  let skipBlockerNextPop = false
  let ignoreNextBeforeUnload = false

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

  // We need to track the current scheduled update to prevent
  // multiple updates from being scheduled at the same time.
  let scheduled: Promise<void> | undefined

  // This function flushes the next update to the browser history
  const flush = () => {
    if (!next) {
      return
    }

    // We need to ignore any updates to the subscribers while we update the browser history
    history._ignoreSubscribers = true

    // Update the browser history
    ;(next.isPush ? win.history.pushState : win.history.replaceState)(
      next.state,
      '',
      next.href,
    )

    // Stop ignoring subscriber updates
    history._ignoreSubscribers = false

    // Reset the nextIsPush flag and clear the scheduled update
    next = undefined
    scheduled = undefined
    rollbackLocation = undefined
  }

  // This function queues up a call to update the browser history
  const queueHistoryAction = (
    type: 'push' | 'replace',
    destHref: string,
    state: any,
  ) => {
    const href = createHref(destHref)

    if (!scheduled) {
      rollbackLocation = currentLocation
    }

    // Update the location in memory
    currentLocation = parseHref(destHref, state)

    // Keep track of the next location we need to flush to the URL
    next = {
      href,
      state,
      isPush: next?.isPush || type === 'push',
    }

    if (!scheduled) {
      // Schedule an update to the browser history
      scheduled = Promise.resolve().then(() => flush())
    }
  }

  const onPushPop = () => {
    currentLocation = parseLocation()
    history.notify()
  }

  const onPushPopEvent = async () => {
    if (ignoreNextPop) {
      ignoreNextPop = false
      return
    }

    if (skipBlockerNextPop) {
      skipBlockerNextPop = false
    } else {
      if (
        typeof document !== 'undefined' &&
        win.blockers &&
        win.blockers.length
      ) {
        for (const blocker of win.blockers) {
          const nextLocation = parseLocation()
          const isBlocked = await blocker.blockerFn({
            currentLocation,
            nextLocation,
            action: 'POP',
          })
          if (isBlocked) {
            ignoreNextPop = true
            win.history.go(1)
            history.notify()
            return
          }
        }
      }
    }

    currentLocation = parseLocation()
    history.notify()
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (ignoreNextBeforeUnload) {
      ignoreNextBeforeUnload = false
      return
    }

    let shouldBlock = false

    // If one blocker has a non-disabled beforeUnload, we should block
    const blockers = win.blockers ?? []
    if (typeof document !== 'undefined' && blockers.length) {
      for (const blocker of blockers) {
        const disable = blocker.disableBeforeUnload ?? false
        if (disable === false) {
          shouldBlock = true
          break
        }

        if (typeof disable === 'function' && disable() === false) {
          shouldBlock = true
          break
        }
      }
    }

    if (shouldBlock) {
      e.preventDefault()
      return (e.returnValue = '')
    }
    return
  }

  const history = createHistory({
    getLocation,
    getLength: () => win.history.length,
    pushState: (href, state) => queueHistoryAction('push', href, state),
    replaceState: (href, state) => queueHistoryAction('replace', href, state),
    back: (ignoreBlocker) => {
      if (ignoreBlocker) skipBlockerNextPop = true
      ignoreNextBeforeUnload = true
      return win.history.back()
    },
    forward: (ignoreBlocker) => {
      if (ignoreBlocker) skipBlockerNextPop = true
      ignoreNextBeforeUnload = true
      win.history.forward()
    },
    go: (n) => win.history.go(n),
    createHref: (href) => createHref(href),
    flush,
    destroy: () => {
      win.history.pushState = originalPushState
      win.history.replaceState = originalReplaceState
      win.removeEventListener(beforeUnloadEvent, onBeforeUnload, {
        capture: true,
      })
      win.removeEventListener(pushStateEvent, onPushPopEvent)
      win.removeEventListener(popStateEvent, onPushPopEvent)
    },
    onBlocked: (onUpdate) => {
      // If a navigation is blocked, we need to rollback the location
      // that we optimistically updated in memory.
      if (rollbackLocation && currentLocation !== rollbackLocation) {
        currentLocation = rollbackLocation
        // Notify subscribers
        onUpdate()
      }
    },
    win,
  })

  win.addEventListener(beforeUnloadEvent, onBeforeUnload, { capture: true })
  win.addEventListener(pushStateEvent, onPushPopEvent)
  win.addEventListener(popStateEvent, onPushPopEvent)

  win.history.pushState = function (...args: Array<any>) {
    const res = originalPushState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop()
    return res
  }

  win.history.replaceState = function (...args: Array<any>) {
    const res = originalReplaceState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop()
    return res
  }

  return history
}

export function createHashHistory(opts?: { window?: any }): RouterHistory {
  const win =
    opts?.window ??
    (typeof document !== 'undefined' ? window : (undefined as any))
  return createBrowserHistory({
    window: win,
    parseLocation: () => {
      const hashHref = win.location.hash.split('#').slice(1).join('#') ?? '/'
      return parseHref(hashHref, win.history.state)
    },
    createHref: (href) =>
      `${win.location.pathname}${win.location.search}#${href}`,
  })
}

export function createMemoryHistory(
  opts: {
    initialEntries: Array<string>
    initialIndex?: number
  } = {
    initialEntries: ['/'],
  },
): RouterHistory {
  const entries = opts.initialEntries
  let index = opts.initialIndex ?? entries.length - 1
  const states = entries.map(() => ({}) as HistoryState)

  const getLocation = () => parseHref(entries[index]!, states[index])

  return createHistory({
    getLocation,
    getLength: () => entries.length,
    pushState: (path, state) => {
      // Removes all subsequent entries after the current index to start a new branch
      if (index < entries.length - 1) {
        entries.splice(index + 1)
        states.splice(index + 1)
      }
      states.push(state)
      entries.push(path)
      index = Math.max(entries.length - 1, 0)
    },
    replaceState: (path, state) => {
      states[index] = state
      entries[index] = path
    },
    back: () => {
      index = Math.max(index - 1, 0)
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
    },
    go: (n) => {
      index = Math.min(Math.max(index + n, 0), entries.length - 1)
    },
    createHref: (path) => path,
  })
}

export function parseHref(
  href: string,
  state: HistoryState | undefined,
): HistoryLocation {
  const hashIndex = href.indexOf('#')
  const searchIndex = href.indexOf('?')

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
