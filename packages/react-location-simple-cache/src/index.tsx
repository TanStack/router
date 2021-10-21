import { LoaderFn, LoaderData, RouteMatch } from 'react-location'

export type FetchPolicy = 'cache-and-network' | 'cache-first' | 'network-only'

export type SimpleCacheRecord<
  TData extends LoaderData = Record<string, unknown>,
> = {
  key: string
  updatedAt: number
  ready: boolean
  promise?: Promise<TData>
  data?: any
  invalid?: boolean
  match: RouteMatch
  // loaderOptions: LoaderFnOptions
}

//

export class ReactLocationSimpleCache {
  records: Record<string, SimpleCacheRecord> = {}

  constructor() {}

  createLoader(
    loader: LoaderFn,
    opts?: {
      key?: (match: RouteMatch) => string
      maxAge?: number
      policy?: FetchPolicy
    },
  ): LoaderFn {
    const maxAge = opts?.maxAge ?? 0
    const policy = opts?.policy ?? 'cache-and-network'

    const cachedLoader: LoaderFn = async (match, loaderOptions) => {
      // Cache on pathname
      const key = opts?.key ? opts.key(match) : match.pathname

      // No cache? Create it.
      if (!this.records[key]) {
        this.records[key] = {
          key,
          updatedAt: 0,
          ready: false,
          promise: null!,
          match,
          // loaderOptions,
        }
      }

      const entry = this.records[key]!

      Object.assign(entry, {
        match,
        loaderOptions,
      })

      const doFetch = () => {
        loaderOptions.dispatch({ type: 'loading' })
        return loader(match, loaderOptions)
          .then((data: any) => {
            entry.updatedAt = Date.now()
            entry.data = data
            entry.ready = true
            loaderOptions.dispatch({ type: 'resolve', data })
            return data
          })
          .catch((err: any) => {
            loaderOptions.dispatch({ type: 'reject', error: err })
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
  }
  filter<TLoaderData>(
    fn: (record: SimpleCacheRecord) => any,
  ): SimpleCacheRecord<TLoaderData>[] {
    return Object.keys(this.records)
      .filter((key) => fn(this.records[key]!))
      .map((d) => this.records[d]) as SimpleCacheRecord<TLoaderData>[]
  }
  find<TLoaderData>(
    fn: (record: SimpleCacheRecord) => any,
  ): SimpleCacheRecord<TLoaderData> | undefined {
    return this.filter<TLoaderData>(fn)[0]
  }
  invalidate(fn: (record: SimpleCacheRecord) => any) {
    const records = this.filter(fn)
    records.forEach((record) => {
      record.invalid = true
    })
  }
  removeAll() {
    this.records = {}
  }
  remove(fn: (record: SimpleCacheRecord) => any) {
    this.filter(fn).forEach((record) => {
      delete this.records[record.key]
    })
  }
}
