import { parseHref } from '@tanstack/history'
import type {
  HistoryAction,
  HistoryLocation,
  NavigateOptions,
  NavigationBlocker,
  ParsedHistoryState,
  RouterHistory,
} from '@tanstack/history'

export interface NativeScriptHistoryOptions {
  initialEntries?: Array<string>
  initialIndex?: number
  initialPath?: string
}

export interface NativeScriptHistoryStackEntry {
  href: string
  index: number
  state: ParsedHistoryState
}

export interface NativeScriptRouterHistory extends Omit<
  RouterHistory,
  'push' | 'replace' | 'go' | 'back' | 'forward'
> {
  push: (...args: Parameters<RouterHistory['push']>) => void | Promise<void>
  replace: (
    ...args: Parameters<RouterHistory['replace']>
  ) => void | Promise<void>
  go: (...args: Parameters<RouterHistory['go']>) => void | Promise<void>
  back: (...args: Parameters<RouterHistory['back']>) => void | Promise<void>
  forward: (
    ...args: Parameters<RouterHistory['forward']>
  ) => void | Promise<void>
  getStackSnapshot: () => Array<NativeScriptHistoryStackEntry>
  hasBlockers: () => boolean
  getBlockers: () => ReadonlyArray<NavigationBlocker>
  subscribeBlockers: (listener: () => void) => () => void
}

const stateIndexKey = '__TSR_index'

function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7)
}

function assignKeyAndIndex(
  index: number,
  state: Record<string, unknown> | undefined,
): ParsedHistoryState {
  const key = createRandomKey()
  return {
    ...(state ?? {}),
    key,
    __TSR_key: key,
    [stateIndexKey]: index,
  } as ParsedHistoryState
}

/**
 * Create the URL history mirrored by a NativeScript Frame.
 *
 * Unlike generic memory history, this implementation evaluates blockers for
 * pop navigation too. Native back buttons can therefore ask the router for
 * permission before changing the Frame, while iOS swipe-back is disabled for
 * as long as a blocker is registered.
 */
export function createNativeScriptHistory(
  options: NativeScriptHistoryOptions = {},
): NativeScriptRouterHistory {
  const initialEntries = options.initialEntries ?? [options.initialPath ?? '/']
  const entries = initialEntries.length ? [...initialEntries] : ['/']
  let index =
    options.initialIndex === undefined
      ? entries.length - 1
      : Math.min(Math.max(options.initialIndex, 0), entries.length - 1)
  const states = entries.map((_entry, entryIndex) =>
    assignKeyAndIndex(entryIndex, undefined),
  )
  let location = parseHref(entries[index]!, states[index])
  let blockers: Array<NavigationBlocker> = []
  let destroyed = false

  const subscribers: RouterHistory['subscribers'] = new Set()
  const blockerSubscribers = new Set<() => void>()

  const notifyBlockers = () => {
    blockerSubscribers.forEach((subscriber) => subscriber())
  }

  const notify: RouterHistory['notify'] = (action) => {
    location = parseHref(entries[index]!, states[index])
    if (!history._ignoreSubscribers) {
      subscribers.forEach((subscriber) => subscriber({ location, action }))
    }
  }

  const commit = (
    nextIndex: number,
    action: Parameters<RouterHistory['notify']>[0],
  ) => {
    index = nextIndex
    notify(action)
  }

  const tryNavigation = (
    action: HistoryAction,
    getNextLocation: () => HistoryLocation,
    task: () => void,
    navigateOptions?: NavigateOptions,
  ): void | Promise<void> => {
    if (destroyed) {
      return
    }

    if (navigateOptions?.ignoreBlocker || blockers.length === 0) {
      task()
      return
    }

    const currentBlockers = [...blockers]
    const currentLocation = location
    const nextLocation = getNextLocation()

    return (async () => {
      for (const blocker of currentBlockers) {
        const isBlocked = await blocker.blockerFn({
          currentLocation,
          nextLocation,
          action,
        })
        if (isBlocked) {
          return
        }
      }

      if (!destroyed && location === currentLocation) {
        task()
      }
    })()
  }

  const move = (
    delta: number,
    action: 'BACK' | 'FORWARD' | 'GO',
    navigateOptions?: NavigateOptions,
  ): void | Promise<void> => {
    const nextIndex = Math.min(Math.max(index + delta, 0), entries.length - 1)
    if (nextIndex === index) {
      return
    }

    return tryNavigation(
      action,
      () => parseHref(entries[nextIndex]!, states[nextIndex]),
      () =>
        commit(
          nextIndex,
          action === 'GO' ? { type: 'GO', index: delta } : { type: action },
        ),
      navigateOptions,
    )
  }

  const history: NativeScriptRouterHistory = {
    supportsNavigationPromises: true,
    get location() {
      return location
    },
    get length() {
      return entries.length
    },
    subscribers,
    subscribe: (subscriber) => {
      subscribers.add(subscriber)
      return () => {
        subscribers.delete(subscriber)
      }
    },
    push: (href, state, navigateOptions) => {
      const nextIndex = index + 1
      const nextState = assignKeyAndIndex(nextIndex, state)
      return tryNavigation(
        'PUSH',
        () => parseHref(href, nextState),
        () => {
          entries.splice(nextIndex)
          states.splice(nextIndex)
          entries.push(href)
          states.push(nextState)
          commit(nextIndex, { type: 'PUSH' })
        },
        navigateOptions,
      )
    },
    replace: (href, state, navigateOptions) => {
      const nextState = assignKeyAndIndex(index, state)
      return tryNavigation(
        'REPLACE',
        () => parseHref(href, nextState),
        () => {
          entries[index] = href
          states[index] = nextState
          notify({ type: 'REPLACE' })
        },
        navigateOptions,
      )
    },
    go: (delta, navigateOptions) => {
      return move(delta, 'GO', navigateOptions)
    },
    back: (navigateOptions) => {
      return move(-1, 'BACK', navigateOptions)
    },
    forward: (navigateOptions) => {
      return move(1, 'FORWARD', navigateOptions)
    },
    canGoBack: () => index > 0,
    createHref: (href) => href,
    block: (blocker) => {
      blockers = [...blockers, blocker]
      notifyBlockers()
      return () => {
        const nextBlockers = blockers.filter(
          (candidate) => candidate !== blocker,
        )
        if (nextBlockers.length !== blockers.length) {
          blockers = nextBlockers
          notifyBlockers()
        }
      }
    },
    flush: () => {},
    destroy: () => {
      destroyed = true
      blockers = []
      subscribers.clear()
      blockerSubscribers.clear()
    },
    notify,
    getEntries: () =>
      entries.map((href, entryIndex) => parseHref(href, states[entryIndex])),
    getStackSnapshot: () =>
      entries.map((href, entryIndex) => ({
        href,
        index: entryIndex,
        state: { ...states[entryIndex]! },
      })),
    hasBlockers: () => blockers.length > 0,
    getBlockers: () => [...blockers],
    subscribeBlockers: (subscriber) => {
      blockerSubscribers.add(subscriber)
      return () => {
        blockerSubscribers.delete(subscriber)
      }
    },
  }

  return history
}

export function isNativeScriptHistory(
  history: RouterHistory,
): history is NativeScriptRouterHistory {
  return (
    typeof (history as Partial<NativeScriptRouterHistory>).hasBlockers ===
      'function' &&
    typeof (history as Partial<NativeScriptRouterHistory>).subscribeBlockers ===
      'function'
  )
}
