// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

import { match } from 'assert'

export interface RouterHistory {
  location: RouterLocation
  listen: (cb: () => void) => () => void
  push: (path: string, state: any) => void
  replace: (path: string, state: any) => void
  go: (index: number) => void
  back: () => void
  forward: () => void
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

const popStateEvent = 'popstate'

function createHistory(opts: {
  getLocation: () => RouterLocation
  listener: (onUpdate: () => void) => () => void
  pushState: (path: string, state: any) => void
  replaceState: (path: string, state: any) => void
  go: (n: number) => void
  back: () => void
  forward: () => void
}): RouterHistory {
  let currentLocation = opts.getLocation()
  let unsub = () => {}
  let listeners = new Set<() => void>()

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
      opts.pushState(path, state)
      onUpdate()
    },
    replace: (path: string, state: any) => {
      opts.replaceState(path, state)
      onUpdate()
    },
    go: (index) => {
      opts.go(index)
      onUpdate()
    },
    back: () => {
      opts.back()
      onUpdate()
    },
    forward: () => {
      opts.forward()
      onUpdate()
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
