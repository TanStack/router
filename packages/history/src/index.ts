// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

export interface NavigateOptions {
  ignoreBlocker?: boolean
  _fullHref?: boolean
}

type SubscriberHistoryAction =
  | {
      type: Exclude<HistoryAction, 'GO'>
    }
  | {
      type: 'GO'
      index: number
    }

type SubscriberArgs = {
  location: HistoryLocation
  action: SubscriberHistoryAction
}

export interface RouterHistory {
  location: HistoryLocation
  length: number
  subscribers: Set<(opts: SubscriberArgs) => void>
  subscribe: (cb: (opts: SubscriberArgs) => void) => () => void
  push: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  replace: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  go: (index: number, navigateOpts?: NavigateOptions) => void
  back: (navigateOpts?: NavigateOptions) => void
  forward: (navigateOpts?: NavigateOptions) => void
  canGoBack: () => boolean
  createHref: (href: string) => string
  block: (blocker: NavigationBlocker) => () => void
  flush: () => void
  destroy: () => void
  notify: (action: SubscriberHistoryAction) => void
  _ignoreSubscribers?: boolean
  origin?: string
}

export interface HistoryLocation extends ParsedPath {
  state: ParsedHistoryState
}

export interface ParsedPath {
  href: string
  url: string
  pathname: string
  search: string
  hash: string
}

export interface HistoryState {}

export type ParsedHistoryState = HistoryState & {
  key?: string // TODO: Remove in v2 - use __TSR_key instead
  __TSR_key?: string
  __TSR_index: number
}

type ShouldAllowNavigation = any

export type HistoryAction = 'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' | 'GO'

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
  enableBeforeUnload?: (() => boolean) | boolean
}

type TryNavigateArgs = {
  task: () => void
  type: 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO'
  navigateOpts?: NavigateOptions
} & (
  | {
      type: 'PUSH' | 'REPLACE'
      href: string
      state: any
    }
  | {
      type: 'BACK' | 'FORWARD' | 'GO'
    }
)

const stateIndexKey = '__TSR_index'
const popStateEvent = 'popstate'
const beforeUnloadEvent = 'beforeunload'

export function createHistory(opts: {
  getLocation: () => HistoryLocation
  getLength: () => number
  pushState: (path: string, state: any, opts?: NavigateOptions) => void
  replaceState: (path: string, state: any, opts?: NavigateOptions) => void
  go: (n: number) => void
  back: (ignoreBlocker: boolean) => void
  forward: (ignoreBlocker: boolean) => void
  createHref: (path: string) => string
  flush?: () => void
  destroy?: () => void
  onBlocked?: () => void
  getBlockers?: () => Array<NavigationBlocker>
  setBlockers?: (blockers: Array<NavigationBlocker>) => void
  // Avoid notifying on forward/back/go, used for browser history as we already get notified by the popstate event
  notifyOnIndexChange?: boolean
  origin?: string
}): RouterHistory {
  let location = opts.getLocation()
  const subscribers = new Set<(opts: SubscriberArgs) => void>()

  const notify = (action: SubscriberHistoryAction) => {
    location = opts.getLocation()
    subscribers.forEach((subscriber) => subscriber({ location, action }))
  }

  const handleIndexChange = (action: SubscriberHistoryAction) => {
    if (opts.notifyOnIndexChange ?? true) notify(action)
    else location = opts.getLocation()
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

    const blockers = opts.getBlockers?.() ?? []
    const isPushOrReplace =
      actionInfo.type === 'PUSH' || actionInfo.type === 'REPLACE'
    if (typeof document !== 'undefined' && blockers.length && isPushOrReplace) {
      for (const blocker of blockers) {
        const nextLocation = parseHref(
          actionInfo.href,
          actionInfo.state,
          opts.origin,
        )
        const isBlocked = await blocker.blockerFn({
          currentLocation: location,
          nextLocation,
          action: actionInfo.type,
        })
        if (isBlocked) {
          opts.onBlocked?.()
          return
        }
      }
    }

    task()
  }

  return {
    origin: opts.origin,
    get location() {
      return location
    },
    get length() {
      return opts.getLength()
    },
    subscribers,
    subscribe: (cb: (opts: SubscriberArgs) => void) => {
      subscribers.add(cb)

      return () => {
        subscribers.delete(cb)
      }
    },
    push: (href, state, navigateOpts) => {
      const currentIndex = location.state[stateIndexKey]
      state = assignKeyAndIndex(currentIndex + 1, state)
      tryNavigation({
        task: () => {
          opts.pushState(href, state, navigateOpts)
          notify({ type: 'PUSH' })
        },
        navigateOpts,
        type: 'PUSH',
        href,
        state,
      })
    },
    replace: (href, state, navigateOpts) => {
      const currentIndex = location.state[stateIndexKey]
      state = assignKeyAndIndex(currentIndex, state)
      tryNavigation({
        task: () => {
          opts.replaceState(href, state, navigateOpts)
          notify({ type: 'REPLACE' })
        },
        navigateOpts,
        type: 'REPLACE',
        href,
        state,
      })
    },
    go: (index, navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.go(index)
          handleIndexChange({ type: 'GO', index })
        },
        navigateOpts,
        type: 'GO',
      })
    },
    back: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.back(navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'BACK' })
        },
        navigateOpts,
        type: 'BACK',
      })
    },
    forward: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.forward(navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'FORWARD' })
        },
        navigateOpts,
        type: 'FORWARD',
      })
    },
    canGoBack: () => location.state[stateIndexKey] !== 0,
    createHref: opts.createHref,
    block: (blocker) => {
      if (!opts.setBlockers) return () => {}
      const blockers = opts.getBlockers?.() ?? []
      opts.setBlockers([...blockers, blocker])

      return () => {
        const blockers = opts.getBlockers?.() ?? []
        opts.setBlockers?.(blockers.filter((b) => b !== blocker))
      }
    },
    flush: () => opts.flush?.(),
    destroy: () => opts.destroy?.(),
    notify,
  }
}

function assignKeyAndIndex(index: number, state: HistoryState | undefined) {
  if (!state) {
    state = {} as HistoryState
  }
  const key = createRandomKey()
  return {
    ...state,
    key, // TODO: Remove in v2 - use __TSR_key instead
    __TSR_key: key,
    [stateIndexKey]: index,
  } as ParsedHistoryState
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
  const win =
    opts?.window ??
    (typeof document !== 'undefined' ? window : (undefined as any))

  const originalPushState = win.history.pushState
  const originalReplaceState = win.history.replaceState

  let blockers: Array<NavigationBlocker> = []
  const _getBlockers = () => blockers
  const _setBlockers = (newBlockers: Array<NavigationBlocker>) =>
    (blockers = newBlockers)

  const createHref = opts?.createHref ?? ((href) => href)
  const parseLocation =
    opts?.parseLocation ??
    (() => parseHref(win.location.href, win.history.state, win.origin))

  // Ensure there is always a key to start
  if (!win.history.state?.__TSR_key && !win.history.state?.key) {
    const addedKey = createRandomKey()
    win.history.replaceState(
      {
        [stateIndexKey]: 0,
        key: addedKey, // TODO: Remove in v2 - use __TSR_key instead
        __TSR_key: addedKey,
      },
      '',
    )
  }

  let currentLocation = parseLocation()
  let rollbackLocation: HistoryLocation | undefined

  let nextPopIsGo = false
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
      next.href.replace(new URL(next.href).origin, ''),
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
    navigateOpts?: NavigateOptions,
  ) => {
    let href = destHref
    if (!navigateOpts?._fullHref) {
      destHref = new URL(destHref, win.origin).href
      href = createHref(destHref)
    }

    if (!scheduled) {
      rollbackLocation = currentLocation
    }

    // Update the location in memory
    currentLocation = parseHref(destHref, state, win.origin)

    // Keep track of the next location we need to flush to the URL
    next = {
      href,
      state,
      isPush: next?.isPush || type === 'push',
    }

    if (!scheduled) {
      // Schedule an update to the browser history
      scheduled = Promise.resolve().then(flush)
    }
  }

  // NOTE: this function can probably be removed
  const onPushPop = (type: 'PUSH' | 'REPLACE') => {
    currentLocation = parseLocation()
    history.notify({ type })
  }

  const onPushPopEvent = async () => {
    if (ignoreNextPop) {
      ignoreNextPop = false
      return
    }

    const nextLocation = parseLocation()
    const delta =
      nextLocation.state[stateIndexKey] - currentLocation.state[stateIndexKey]
    const isForward = delta === 1
    const isBack = delta === -1
    const isGo = (!isForward && !isBack) || nextPopIsGo
    nextPopIsGo = false

    const action = isGo ? 'GO' : isBack ? 'BACK' : 'FORWARD'
    const notify: SubscriberHistoryAction = isGo
      ? {
          type: 'GO',
          index: delta,
        }
      : {
          type: isBack ? 'BACK' : 'FORWARD',
        }

    if (skipBlockerNextPop) {
      skipBlockerNextPop = false
    } else {
      const blockers = _getBlockers()
      if (typeof document !== 'undefined' && blockers.length) {
        for (const blocker of blockers) {
          const isBlocked = await blocker.blockerFn({
            currentLocation,
            nextLocation,
            action,
          })
          if (isBlocked) {
            ignoreNextPop = true
            win.history.go(1)
            history.notify(notify)
            return
          }
        }
      }
    }

    currentLocation = parseLocation()
    history.notify(notify)
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (ignoreNextBeforeUnload) {
      ignoreNextBeforeUnload = false
      return
    }

    let shouldBlock = false

    // If one blocker has a non-disabled beforeUnload, we should block
    const blockers = _getBlockers()
    if (typeof document !== 'undefined' && blockers.length) {
      for (const blocker of blockers) {
        const shouldHaveBeforeUnload = blocker.enableBeforeUnload ?? true
        if (shouldHaveBeforeUnload === true) {
          shouldBlock = true
          break
        }

        if (
          typeof shouldHaveBeforeUnload === 'function' &&
          shouldHaveBeforeUnload() === true
        ) {
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
    pushState: (href, state, opts) =>
      queueHistoryAction('push', href, state, opts),
    replaceState: (href, state, opts) =>
      queueHistoryAction('replace', href, state, opts),
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
    go: (n) => {
      nextPopIsGo = true
      win.history.go(n)
    },
    createHref: (href) => createHref(href),
    flush,
    destroy: () => {
      win.history.pushState = originalPushState
      win.history.replaceState = originalReplaceState
      win.removeEventListener(beforeUnloadEvent, onBeforeUnload, {
        capture: true,
      })
      win.removeEventListener(popStateEvent, onPushPopEvent)
    },
    onBlocked: () => {
      // If a navigation is blocked, we need to rollback the location
      // that we optimistically updated in memory.
      if (rollbackLocation && currentLocation !== rollbackLocation) {
        currentLocation = rollbackLocation
      }
    },
    getBlockers: _getBlockers,
    setBlockers: _setBlockers,
    notifyOnIndexChange: false,
    origin: win.origin,
  })

  win.addEventListener(beforeUnloadEvent, onBeforeUnload, { capture: true })
  win.addEventListener(popStateEvent, onPushPopEvent)

  win.history.pushState = function (...args: Array<any>) {
    const res = originalPushState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop('PUSH')
    return res
  }

  win.history.replaceState = function (...args: Array<any>) {
    const res = originalReplaceState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop('REPLACE')
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
      const hashSplit = win.location.hash.split('#').slice(1)
      const pathPart = hashSplit[0] ?? '/'
      const searchPart = win.location.search
      const hashEntries = hashSplit.slice(1)
      const hashPart =
        hashEntries.length === 0 ? '' : `#${hashEntries.join('#')}`
      const hashHref = `${pathPart}${searchPart}${hashPart}`
      return parseHref(hashHref, win.history.state, win.origin)
    },
    createHref: (href) => {
      const winLocation = new URL(win.location)
      winLocation.hash = ''
      return winLocation.href + '#' + href.replace(win.origin, '')
    },
  })
}

export function createMemoryHistory(
  opts: {
    initialEntries: Array<string>
    initialIndex?: number
    origin?: string
  } = {
    initialEntries: ['/'],
  },
): RouterHistory {
  const _origin = opts.origin ?? 'http://localhost'
  const entries = opts.initialEntries
  let index = opts.initialIndex
    ? Math.min(Math.max(opts.initialIndex, 0), entries.length - 1)
    : entries.length - 1
  const states = entries.map((_entry, index) =>
    assignKeyAndIndex(index, undefined),
  )

  const getLocation = () => parseHref(entries[index]!, states[index], _origin)

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
    origin: opts.origin,
  })
}

export function parseHref(
  href: string,
  state: ParsedHistoryState | undefined,
  fallbackOrigin?: string,
): HistoryLocation {
  href = withOrigin(href, fallbackOrigin ?? 'http://localhost')
  const fullPath = href.replace(new URL(href).origin, '')
  const hashIndex = fullPath.indexOf('#')
  const searchIndex = fullPath.indexOf('?')
  const addedKey = createRandomKey()

  return {
    href: fullPath,
    url: href,
    pathname: fullPath.substring(
      0,
      hashIndex > 0
        ? searchIndex > 0
          ? Math.min(hashIndex, searchIndex)
          : hashIndex
        : searchIndex > 0
          ? searchIndex
          : fullPath.length,
    ),
    hash: hashIndex > -1 ? fullPath.substring(hashIndex) : '',
    search:
      searchIndex > -1
        ? fullPath.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
        : '',
    state: state || { [stateIndexKey]: 0, key: addedKey, __TSR_key: addedKey },
  }
}

export function withOrigin(href: string, fallbackOrigin: string) {
  try {
    return new URL(href).href
  } catch {
    return new URL(href, fallbackOrigin).href
  }
}

// Thanks co-pilot!
function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7)
}
