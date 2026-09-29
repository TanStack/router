import { isServer } from '@tanstack/router-core/isServer'
import { removeTrailingSlash } from './path'
import { deepEqual, getUrlScheme, isDangerousProtocol } from './utils'
import type { ActiveOptions } from './link'
import type { ParsedLocation } from './location'
import type { AnyRouter, BuildNextOptions } from './router'
import type { LoadTransaction } from './load-client'

export type LinkStateOptions = BuildNextOptions & {
  disabled?: boolean
  activeOptions?: ActiveOptions
}

export type LinkState = readonly [href: string | undefined, isActive?: boolean]

export interface LinkView {
  getSnapshot: () => LinkState
  commit: () => void
}

export interface LinkStore {
  render: (
    options: LinkStateOptions,
    ownerRouteId?: string,
    activeHash?: false | string,
    evaluate?: <T>(read: () => T) => T,
  ) => LinkView
  getSnapshot: () => LinkState
  subscribe: (listener: () => void) => () => void
  getLocation: () => ParsedLocation | undefined
  invalidate: () => void
}

/** Actual build reads, kept separate from public location objects. */
export interface LinkBuildTracking {
  dependencies: number
  location: ParsedLocation
}

function directHref(router: AnyRouter, to: unknown) {
  if (typeof to !== 'string') {
    return undefined
  }
  const scheme = getUrlScheme(to)
  if (!scheme) {
    return undefined
  }
  if (!router.protocolAllowlist.has(scheme)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${to}`)
    }
    return null
  }
  return to
}

function isActive(
  router: AnyRouter,
  location: ParsedLocation,
  next: ParsedLocation,
  options: ActiveOptions | undefined,
  activeHash: false | string | undefined,
) {
  const currentPath = removeTrailingSlash(location.pathname, router.basepath)
  const nextPath = removeTrailingSlash(next.pathname, router.basepath)
  if (
    options?.exact
      ? currentPath !== nextPath
      : !(
          currentPath.startsWith(nextPath) &&
          (currentPath.length === nextPath.length ||
            currentPath[nextPath.length] === '/')
        )
  ) {
    return false
  }
  if (
    (options?.includeSearch ?? true) &&
    !deepEqual(
      location.search,
      next.search,
      !options?.exact,
      options?.explicitUndefined,
    )
  ) {
    return false
  }
  return (
    !options?.includeHash ||
    (activeHash !== false && (activeHash ?? location.hash) === next.hash)
  )
}

function stateFor(
  router: AnyRouter,
  options: LinkStateOptions,
  location: ParsedLocation,
  next: ParsedLocation | undefined,
  direct: string | null | undefined,
  activeHash: false | string | undefined,
): LinkState {
  if (direct !== undefined) {
    return [direct ?? undefined]
  }
  const target = next!.maskedLocation ?? next!
  let href = options.disabled
    ? undefined
    : target.external
      ? target.publicHref
      : router.history.createHref(target.publicHref) || '/'
  if (
    href &&
    (target.external || href !== target.publicHref) &&
    isDangerousProtocol(href, router.protocolAllowlist)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${href}`)
    }
    href = undefined
  }
  const internal = options.disabled || (href && !getUrlScheme(href))
  return [
    href,
    internal
      ? isActive(router, location, next!, options.activeOptions, activeHash)
      : undefined,
  ]
}

/** Static rendering uses the same derivation without creating subscriptions. */
export function readLinkState(
  router: AnyRouter,
  options: LinkStateOptions,
  activeHash?: false | string,
): LinkState {
  const direct = directHref(router, options.to)
  const next =
    direct === undefined ? router.buildLocation(options as any) : undefined
  return stateFor(
    router,
    options,
    router.stores.location.get(),
    next,
    direct,
    activeHash,
  )
}

type LinkResult = [state: LinkState] | [state: undefined, error: unknown]

type LinkValue = {
  view: LinkViewState
  result: LinkResult
  destination: ParsedLocation | undefined
  dependencies: number
  direct: string | null | undefined
  path: string | undefined
  configuration: object
}

/** An immutable set of render inputs; only commit adopts it into the registry. */
class LinkViewState implements LinkView {
  value: LinkValue | undefined
  // Speculative and unsubscribed views need source identity for catchup. An
  // indexed view relies on its registry and must not retain historical state.
  private source: ParsedLocation | undefined

  constructor(
    readonly record: LinkRecord,
    readonly options: LinkStateOptions,
    readonly owner: string | undefined,
    readonly activeHash: false | string | undefined,
    readonly evaluate?: <T>(read: () => T) => T,
  ) {}

  getSnapshot = (): LinkState => {
    const result = this.refresh(false)!.result
    if (!result[0]) {
      throw result[1]
    }
    return result[0]
  }

  commit() {
    this.refresh(true)
  }

  private refresh(adopt: boolean) {
    const record = this.record
    const router = record.router
    const previous = record.current
    for (;;) {
      const location = router.stores.location.get()
      const configuration = router._linkOptions
      let value = this.value
      const ready =
        value &&
        value.configuration === configuration &&
        ((record.current === this && record.listener) ||
          this.source === location)
      if (ready && !adopt) {
        return value
      }
      if (!ready) {
        value = this.prepare(location, true)
      }
      // A render may catch up its own speculative view. A commit must also
      // retain the accepted owner it started with, or leave its successor alone.
      if (adopt && record.current !== previous) {
        return
      }
      if (
        router.stores.location.get() !== location ||
        router._linkOptions !== configuration
      ) {
        continue
      }
      if (adopt || (record.current === this && record.listener)) {
        record.adopt(this, value!)
      } else {
        this.value = value
        this.source = location
      }
      if (adopt) {
        this.source = record.listener ? undefined : location
        router._links?.accept(record)
      }
      return value
    }
  }

  releaseSource() {
    this.source = undefined
  }

  prepare(location: ParsedLocation, rebuild: boolean): LinkValue {
    const router = this.record.router
    const previous = this.value
    const configuration = router._linkOptions
    let direct = previous?.direct
    let destination = previous?.destination
    const reads: LinkBuildTracking = {
      dependencies: rebuild ? 0 : previous!.dependencies,
      location,
    }
    let result: LinkResult
    try {
      if (rebuild) {
        direct = directHref(router, this.options.to)
        // A full retarget also clears native callback dependencies when the
        // new destination is external. Active-only reads keep those intact.
        destination = this.evaluate
          ? this.evaluate(() =>
              direct === undefined
                ? router._buildLocation(this.options, reads)
                : undefined,
            )
          : direct === undefined
            ? router._buildLocation(this.options, reads)
            : undefined
      }
      result = [
        stateFor(
          router,
          this.options,
          location,
          destination,
          direct,
          this.activeHash,
        ),
      ]
    } catch (error) {
      // Errors belong to the component reading this view, not to navigation.
      result = [undefined, error]
      reads.dependencies |= previous?.dependencies ?? 0
    }
    // Canonicalize before a render can observe this snapshot. Adoption must
    // preserve that exposed identity, including when another view was current.
    const previousResult =
      previous?.result ?? this.record.current?.value?.result
    if (previousResult) {
      const oldState = previousResult[0]
      const nextState = result[0]
      if (
        oldState && nextState
          ? oldState[0] === nextState[0] && oldState[1] === nextState[1]
          : oldState === nextState && previousResult[1] === result[1]
      ) {
        result = previousResult
      }
    }
    const activeDependencies =
      1 |
      ((this.options.activeOptions?.includeSearch ?? true) ? 2 : 0) |
      (this.options.activeOptions?.includeHash ? 4 : 0)
    return {
      view: this,
      result,
      destination,
      dependencies: reads.dependencies,
      direct,
      // These dependencies already select every active-relevant source change.
      path:
        destination &&
        (reads.dependencies & activeDependencies) !== activeDependencies
          ? removeTrailingSlash(destination.pathname, router.basepath)
          : undefined,
      configuration,
    }
  }
}

/** One subscription and index identity for the component's committed lifetime. */
class LinkRecord implements LinkStore {
  current: LinkViewState | undefined
  listener: (() => void) | undefined

  constructor(readonly router: AnyRouter) {}

  get value() {
    return this.current!.value!
  }

  get owner() {
    return this.current!.owner
  }

  render(
    options: LinkStateOptions,
    ownerRouteId?: string,
    activeHash?: false | string,
    evaluate?: <T>(read: () => T) => T,
  ): LinkView {
    return new LinkViewState(this, options, ownerRouteId, activeHash, evaluate)
  }

  getSnapshot() {
    return this.current!.getSnapshot()
  }

  getLocation() {
    this.getSnapshot()
    return this.value.destination
  }

  subscribe = (listener: () => void) => {
    if (isServer ?? this.router.isServer) {
      return () => {}
    }
    if (!this.listener && this.current) {
      this.current.commit()
      this.listener = listener
      const registry = (this.router._links ??= new LinkRegistry(this.router))
      registry.add(this)
      this.current.releaseSource()
    } else {
      this.listener = listener
    }
    return () => {
      if (this.listener === listener) {
        this.listener = undefined
        if (this.current) {
          this.current.releaseSource()
          this.router._links?.remove(this)
        }
      }
    }
  }

  invalidate() {
    this.router._links?.invalidate(this)
  }

  prepare(location: ParsedLocation, rebuild: boolean) {
    return this.current!.prepare(location, rebuild)
  }

  apply(value: LinkValue) {
    // Another candidate's user callback may have retargeted this component.
    if (this.current !== value.view) {
      return false
    }
    return this.adopt(value.view, value)
  }

  adopt(view: LinkViewState, value: LinkValue) {
    const previous = this.current?.value
    const changed = previous?.result !== value.result
    const reindex =
      previous &&
      (previous.path !== value.path ||
        previous.dependencies !== value.dependencies)
    const registry = this.listener ? this.router._links : undefined
    if (reindex) {
      registry?.unindex(this)
    }
    view.value = value
    this.current = view
    if (!previous && this.listener) {
      const initialRegistry = (this.router._links ??= new LinkRegistry(
        this.router,
      ))
      initialRegistry.add(this)
    } else if (reindex) {
      registry?.index(this)
    }
    return changed || previous?.destination?.href !== value.destination?.href
  }

  notify() {
    this.listener?.()
  }
}

/** Render views remain unregistered until their component commits. */
export function createLinkStore(router: AnyRouter): LinkStore {
  return new LinkRecord(router)
}

/** Indexes outputs and actual build reads rather than broadcasting location. */
export class LinkRegistry {
  private records = new Set<LinkRecord>()
  private paths = new Map<string, Set<LinkRecord>>()
  // Four source fields form at most 15 nonempty masks: one membership per Link.
  private dependencies: Array<Set<LinkRecord> | undefined> = []
  private deferred = new Set<LinkRecord>()
  private waiting: LoadTransaction | undefined
  private location: ParsedLocation
  private configuration: object
  private hrefSource: unknown

  constructor(private router: AnyRouter) {
    this.location = router.stores.location.get()
    this.configuration = router._linkOptions
    this.hrefSource = router.history._hrefSource?.read()
    router.stores._onLocationChange = this.update
  }

  add(record: LinkRecord) {
    this.records.add(record)
    this.index(record)
  }

  accept(record: LinkRecord) {
    this.deferred.delete(record)
  }

  remove(record: LinkRecord) {
    this.records.delete(record)
    this.deferred.delete(record)
    this.unindex(record)
    if (!this.records.size) {
      this.router.stores._onLocationChange = undefined
      this.router._links = undefined
    }
  }

  index(record: LinkRecord) {
    if (record.value.path !== undefined) {
      let path = this.paths.get(record.value.path)
      if (!path) {
        this.paths.set(record.value.path, (path = new Set()))
      }
      path.add(record)
    }
    const mask = record.value.dependencies
    if (mask) {
      const group = (this.dependencies[mask] ??= new Set())
      group.add(record)
    }
  }

  unindex(record: LinkRecord) {
    if (record.value.path !== undefined) {
      const path = this.paths.get(record.value.path)
      path?.delete(record)
      if (!path?.size) {
        this.paths.delete(record.value.path)
      }
    }
    this.dependencies[record.value.dependencies]?.delete(record)
  }

  private candidates(pathname: string, result: Set<LinkRecord>) {
    let path = removeTrailingSlash(pathname, this.router.basepath)
    for (;;) {
      this.paths.get(path)?.forEach((record) => result.add(record))
      const slash = path.lastIndexOf('/')
      // '/' only matches itself or a double-slash prefix, not ordinary paths.
      if (slash <= 0) {
        return
      }
      path = path.slice(0, slash)
    }
  }

  private update = () => {
    const router = this.router
    const location = router.stores.location.get()
    const previous = this.location
    const configuration = router._linkOptions
    const force = configuration !== this.configuration
    const changed =
      (previous.pathname !== location.pathname ? 1 : 0) |
      (previous.search !== location.search ? 2 : 0) |
      (previous.hash !== location.hash ? 4 : 0) |
      (previous.state !== location.state ? 8 : 0)
    const formatting = router.history._hrefSource
    const hrefSource = formatting?.read()
    const formatChanged =
      !formatting ||
      formatting.createHref !== router.history.createHref ||
      hrefSource !== this.hrefSource
    const candidates = new Set<LinkRecord>()
    if (force) {
      this.records.forEach((record) => candidates.add(record))
    } else {
      if (changed & 7) {
        this.candidates(previous.pathname, candidates)
        this.candidates(location.pathname, candidates)
      }
      for (let mask = 1; mask < this.dependencies.length; mask++) {
        if (changed & mask) {
          this.dependencies[mask]?.forEach((record) => candidates.add(record))
        }
      }
      if (formatChanged) {
        for (const record of this.records) {
          if (record.value.destination) {
            candidates.add(record)
          }
        }
      }
    }
    const owner = router._tx
    const pending =
      owner?.[2 /* location */] === location &&
      router.stores.status.get() === 'pending'
        ? owner
        : undefined
    const retained = pending
      ? new Set(pending[3 /* matches */].map((match) => match.routeId))
      : undefined
    this.deferred.forEach((record) => {
      if (!record.owner || !retained || retained.has(record.owner)) {
        candidates.add(record)
      }
    })
    const prepared: Array<[LinkValue, LinkValue]> = []
    const departing: Array<LinkRecord> = []
    for (const record of candidates) {
      if (!this.records.has(record)) {
        continue
      }
      if (record.owner && retained && !retained.has(record.owner)) {
        departing.push(record)
        continue
      }
      const previousValue = record.value
      const value = record.prepare(
        location,
        force ||
          this.deferred.has(record) ||
          !!(previousValue.dependencies & changed),
      )
      // A build updater may navigate. Its successor prepares against the last
      // complete publication, and this obsolete preparation publishes nothing.
      if (router.stores.location.get() !== location || router._tx !== owner) {
        return
      }
      prepared.push([previousValue, value])
    }
    for (const record of departing) {
      // A later updater may synchronously unmount an earlier candidate.
      if (this.records.has(record)) {
        this.deferred.add(record)
      }
    }
    const notifications = this.apply(prepared)
    this.location = location
    this.configuration = configuration
    this.hrefSource = hrefSource
    if (pending && this.deferred.size && this.waiting !== pending) {
      this.waiting = pending
      pending[5 /* done */].then(
        () => this.settle(pending),
        () => this.settle(pending),
      )
    }
    // All outputs and indexes agree before callbacks can navigate. Continue
    // notifying surviving subscribers after reentry: they read the newest
    // snapshot, including an earlier change their successor did not alter.
    this.notify(notifications)
  }

  /** Native callback inputs use the same publication path as location inputs. */
  invalidate(record: LinkRecord) {
    if (!this.records.has(record)) {
      return
    }
    const location = this.router.stores.location.get()
    const owner = this.router._tx
    const previousValue = record.value
    const value = record.prepare(location, true)
    if (
      this.router.stores.location.get() === location &&
      this.router._tx === owner
    ) {
      this.notify(this.apply([[previousValue, value]]))
    }
  }

  private apply(prepared: Array<[LinkValue, LinkValue]>) {
    const notifications: Array<LinkRecord> = []
    for (const [previousValue, value] of prepared) {
      const record = value.view.record
      // A sibling updater can publish newer native inputs without changing
      // the location or view. Only replace the value we prepared against.
      if (
        this.records.has(record) &&
        record.current === value.view &&
        record.value === previousValue
      ) {
        this.deferred.delete(record)
        if (record.apply(value)) {
          notifications.push(record)
        }
      }
    }
    return notifications
  }

  private notify(records: Array<LinkRecord>) {
    for (const record of records) {
      if (this.records.has(record)) {
        record.notify()
      }
    }
  }

  private settle(owner: LoadTransaction) {
    const router = this.router
    if (this.waiting === owner) {
      this.waiting = undefined
    }
    if (router._tx !== owner || router._links !== this) {
      return
    }
    const location = router.stores.location.get()
    const prepared: Array<[LinkValue, LinkValue]> = []
    for (const record of this.deferred) {
      const previousValue = record.value
      const value = record.prepare(location, true)
      if (router._tx !== owner || router.stores.location.get() !== location) {
        return
      }
      prepared.push([previousValue, value])
    }
    router.batch(() => this.notify(this.apply(prepared)))
  }
}
