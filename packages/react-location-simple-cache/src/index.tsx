import {
  LoaderFn,
  RouteMatch,
  PartialGenerics,
  DefaultGenerics,
} from '@tanstack/react-router'

export type FetchPolicy = 'cache-and-network' | 'cache-first' | 'network-only'

export type SimpleCacheRecord<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  key: string
  updatedAt: number
  ready: boolean
  data?: any
  invalid?: boolean
  match: RouteMatch<TGenerics>
}

export type SimpleCacheRecords<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = Record<string, SimpleCacheRecord<TGenerics>>

//

export class ReactLocationSimpleCache<
  TDefualtGenerics extends PartialGenerics = DefaultGenerics,
> {
  records: SimpleCacheRecords<any> = {}

  constructor() {}

  createLoader<TGenerics extends TDefualtGenerics = TDefualtGenerics>(
    loader: LoaderFn<TGenerics>,
    opts?: {
      key?: (match: RouteMatch<TGenerics>) => string
      maxAge?: number
      policy?: FetchPolicy
    },
  ): LoaderFn<TGenerics> {
    const maxAge = opts?.maxAge ?? 0
    const policy = opts?.policy ?? 'cache-and-network'

    const cachedLoader: LoaderFn<TGenerics> = async (match, loaderOptions) => {
      // Cache on pathname
      const key = opts?.key ? opts.key(match) : match.pathname

      // No cache? Create it.
      if (!this.records[key]) {
        this.records[key] = {
          key,
          updatedAt: 0,
          ready: false,
          match,
        }
      }

      const entry = this.records[key]!

      Object.assign(entry, {
        match,
        loaderOptions,
      })

      if (policy === 'network-only') {
        return await match.invalidate()
      }

      if (!entry.updatedAt) {
        await match.invalidate()
      }

      if (policy === 'cache-first') {
        return entry.data
      }

      if (Date.now() - entry.updatedAt > maxAge) {
        match.invalidate()
      }

      return entry.data
    }

    return cachedLoader
  }
  filter<TGenerics extends TDefualtGenerics = TDefualtGenerics>(
    fn: (record: SimpleCacheRecord<TGenerics>) => any,
  ): SimpleCacheRecord<TGenerics>[] {
    return Object.keys(this.records)
      .filter((key) => fn(this.records[key]!))
      .map((d) => this.records[d]) as SimpleCacheRecord<TGenerics>[]
  }
  find<TGenerics extends TDefualtGenerics = TDefualtGenerics>(
    fn: (record: SimpleCacheRecord<TGenerics>) => any,
  ): SimpleCacheRecord<TGenerics> | undefined {
    return this.filter<TGenerics>(fn)[0]
  }
  invalidate<TGenerics extends TDefualtGenerics = TDefualtGenerics>(
    fn: (record: SimpleCacheRecord<TGenerics>) => any,
  ) {
    const records = this.filter(fn)
    records.forEach((record) => {
      record.invalid = true
    })
  }
  removeAll() {
    this.records = {}
  }
  remove<TGenerics extends TDefualtGenerics = TDefualtGenerics>(
    fn: (record: SimpleCacheRecord<TGenerics>) => any,
  ) {
    this.filter(fn).forEach((record) => {
      delete this.records[record.key]
    })
  }
}
