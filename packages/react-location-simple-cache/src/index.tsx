import { Loader, RouteMatch } from 'react-location'

export type FetchPolicy = 'cache-and-network' | 'cache-first' | 'network-only'

export type ReactLocationSimpleCache = {
  createLoader: (
    loader: Loader,
    opts?: {
      key?: (match: RouteMatch) => string
      maxAge?: number
      policy?: FetchPolicy
    },
  ) => Loader
  invalidateAll: () => void
  invalidateKey: (key: string) => void
}

//

export function createReactLocationSimpleCache(): ReactLocationSimpleCache {
  let cache: Record<
    string,
    { updatedAt: number; ready: boolean; promise?: Promise<any>; data?: any }
  > = {}

  return {
    createLoader(loader, opts) {
      const maxAge = opts?.maxAge ?? 0
      const policy = opts?.policy ?? 'cache-and-network'

      const cachedLoader: Loader = async (match, options) => {
        // Cache on pathname
        const key = opts?.key ? opts.key(match) : match.pathname

        // No cache? Create it.
        if (!cache[key]) {
          cache[key] = {
            updatedAt: 0,
            ready: false,
            promise: null!,
          }
        }

        const entry = cache[key]!

        const doFetch = () => {
          options.dispatch({ type: 'loading' })
          return loader(match, options)
            .then((data: any) => {
              entry.updatedAt = Date.now()
              entry.data = data
              entry.ready = true
              options.dispatch({ type: 'resolve', data })
              return data
            })
            .catch((err: any) => {
              options.dispatch({ type: 'reject', error: err })
              throw err
            })
        }

        if (policy === 'network-only') {
          return await doFetch()
        }

        if (!entry.updatedAt) {
          await doFetch()
        }

        if (policy === 'cache-first') {
          return entry.data
        }

        if (Date.now() - entry.updatedAt > maxAge) {
          doFetch()
        }

        return entry.data
      }

      return cachedLoader
    },
    invalidateAll: () => {
      cache = {}
    },
    invalidateKey: (key) => {
      delete cache[key]
    },
  }
}
