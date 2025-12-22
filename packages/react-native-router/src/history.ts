import { createHistory, parseHref } from '@tanstack/history'
import type { RouterHistory, ParsedHistoryState } from '@tanstack/history'

export interface NativeHistoryOptions {
  initialEntries?: Array<string>
  initialIndex?: number
}

const stateIndexKey = '__TSR_index'

function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7)
}

function assignKeyAndIndex(index: number, state: any) {
  if (!state) {
    state = {}
  }
  const key = createRandomKey()
  return {
    ...state,
    key,
    __TSR_key: key,
    [stateIndexKey]: index,
  } as ParsedHistoryState
}

/**
 * Create a history implementation for React Native.
 *
 * This is similar to memory history but designed for integration
 * with native navigation patterns and gesture handlers.
 *
 * @param opts - Configuration options
 * @param opts.initialEntries - Initial history entries (default: ['/'])
 * @param opts.initialIndex - Initial index in the history stack
 * @returns A RouterHistory instance
 */
export function createNativeHistory(
  opts: NativeHistoryOptions = {
    initialEntries: ['/'],
  },
): RouterHistory {
  const entries = opts.initialEntries ?? ['/']
  let index = opts.initialIndex
    ? Math.min(Math.max(opts.initialIndex, 0), entries.length - 1)
    : entries.length - 1
  const states = entries.map((_entry, i) => assignKeyAndIndex(i, undefined))

  const getLocation = () => parseHref(entries[index]!, states[index])

  // Callback for when a native gesture (swipe-back) triggers navigation
  let onNativeBack: (() => void) | undefined

  const history = createHistory({
    getLocation,
    getLength: () => entries.length,
    pushState: (path, state) => {
      // Remove all entries after current index (start a new branch)
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

  // Extend with native-specific functionality
  const nativeHistory = history as RouterHistory & {
    /**
     * Called by native gesture handler when user swipes back.
     * This allows the router to stay in sync with native navigation.
     */
    handleNativeBack: () => void
    /**
     * Set callback for when the router triggers a back navigation.
     * Used to sync with native screen stack.
     */
    setOnNativeBack: (cb: (() => void) | undefined) => void
    /**
     * Get current stack depth for debugging
     */
    getStackDepth: () => number
  }

  nativeHistory.handleNativeBack = () => {
    if (index > 0) {
      history.back()
    }
  }

  nativeHistory.setOnNativeBack = (cb) => {
    onNativeBack = cb
  }

  nativeHistory.getStackDepth = () => entries.length

  return nativeHistory
}

export type NativeRouterHistory = ReturnType<typeof createNativeHistory>
