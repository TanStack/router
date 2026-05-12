import { useRouter } from './useRouter'
import type { Handle, RemixNode } from '@remix-run/ui'
import type {
  BlockerFnArgs,
  HistoryAction,
  HistoryLocation,
} from '@tanstack/history'
import type {
  AnyRoute,
  AnyRouter,
  ParseRoute,
  RegisteredRouter,
} from '@tanstack/router-core'

type ShouldBlockFnLocation<
  out TRouteId,
  out TFullPath,
  out TAllParams,
  out TFullSearchSchema,
> = {
  routeId: TRouteId
  fullPath: TFullPath
  pathname: string
  params: TAllParams
  search: TFullSearchSchema
}

type AnyShouldBlockFnLocation = ShouldBlockFnLocation<any, any, any, any>
type MakeShouldBlockFnLocationUnion<
  TRouter extends AnyRouter = RegisteredRouter,
  TRoute extends AnyRoute = ParseRoute<TRouter['routeTree']>,
> = TRoute extends any
  ? ShouldBlockFnLocation<
      TRoute['id'],
      TRoute['fullPath'],
      TRoute['types']['allParams'],
      TRoute['types']['fullSearchSchema']
    >
  : never

export type BlockerResolver<TRouter extends AnyRouter = RegisteredRouter> =
  | {
      status: 'blocked'
      current: MakeShouldBlockFnLocationUnion<TRouter>
      next: MakeShouldBlockFnLocationUnion<TRouter>
      action: HistoryAction
      proceed: () => void
      reset: () => void
    }
  | {
      status: 'idle'
      current: undefined
      next: undefined
      action: undefined
      proceed: undefined
      reset: undefined
    }

export type ShouldBlockFn<TRouter extends AnyRouter = RegisteredRouter> = (
  args: {
    current: MakeShouldBlockFnLocationUnion<TRouter>
    next: MakeShouldBlockFnLocationUnion<TRouter>
    action: HistoryAction
  },
) => boolean | Promise<boolean>

export type UseBlockerOpts<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
> = {
  shouldBlockFn: ShouldBlockFn<TRouter>
  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  withResolver?: TWithResolver
}

const idleResolver: BlockerResolver<any> = {
  status: 'idle',
  current: undefined,
  next: undefined,
  action: undefined,
  proceed: undefined,
  reset: undefined,
}

/**
 * Legacy single-arg form: `useBlocker(blockerFn?, condition?)`.
 *
 * @deprecated Pass `{ shouldBlockFn }` as the opts object instead.
 */
type LegacyBlockerFn = () => Promise<any> | any
type LegacyBlockerOpts = {
  blockerFn?: LegacyBlockerFn
  condition?: boolean | any
}

/**
 * `update()` accepts the same shapes as `useBlocker` to support legacy
 * call sites. Legacy forms get re-resolved through
 * `_resolveBlockerOpts` so a fresh `condition` is honored.
 */
type BlockerUpdate<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
> = ((opts: UseBlockerOpts<TRouter, TWithResolver>) => void) &
  ((blockerFn: LegacyBlockerFn, condition?: boolean | any) => void) &
  ((legacyOpts: LegacyBlockerOpts) => void)

function _resolveBlockerOpts<
  TRouter extends AnyRouter,
  TWithResolver extends boolean,
>(
  opts?:
    | UseBlockerOpts<TRouter, TWithResolver>
    | LegacyBlockerOpts
    | LegacyBlockerFn,
  condition?: boolean | any,
): UseBlockerOpts<TRouter, TWithResolver> {
  if (opts === undefined) {
    return {
      shouldBlockFn: (() => true) as any,
      withResolver: false as any,
    }
  }

  if (typeof opts === 'object' && 'shouldBlockFn' in opts) {
    return opts
  }

  if (typeof opts === 'function') {
    const shouldBlock = Boolean(condition ?? true)
    const fn = async () => {
      if (shouldBlock) return await opts()
      return false
    }
    return {
      shouldBlockFn: fn as any,
      enableBeforeUnload: shouldBlock,
      withResolver: false as any,
    }
  }

  const legacy = opts
  const shouldBlock = Boolean(legacy.condition ?? true)
  const fn = async () => {
    if (shouldBlock && legacy.blockerFn !== undefined) {
      return await legacy.blockerFn()
    }
    return shouldBlock
  }
  return {
    shouldBlockFn: fn as any,
    enableBeforeUnload: shouldBlock,
    withResolver: (legacy.blockerFn === undefined) as any,
  }
}

/**
 * Block navigation and optionally surface a "blocked" resolver to the UI.
 *
 * Returns `{ read, update }`:
 *
 * - `read()` — getter for the current `BlockerResolver`. Toggles to
 *   `'blocked'` when navigation is intercepted; `proceed()` lets it
 *   through, `reset()` cancels.
 * - `update(opts)` — call from the render function with the latest
 *   options. Subsequent navigations will see the new `shouldBlockFn`,
 *   `disabled`, and `withResolver`. Cheap; just swaps a closure-held
 *   ref. Lets a parent component change opts without re-registering
 *   (which would leak blockers).
 *
 * The blocker is registered at setup time and torn down when the
 * component disconnects (`handle.signal` aborts).
 *
 * Differs from the React/Solid bindings, which return `void` or `() =>
 * Resolver` based on the `withResolver` flag. The Remix binding
 * returns the richer `{ read, update }` because Remix UI's coarser
 * reactivity needs explicit opts swapping to avoid leaking blockers
 * across re-renders. The React-compat shape is exposed via the
 * deprecated overloads below for migration.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useBlockerHook
 */
export function useBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  handle: Handle<any, any>,
  initialOpts: UseBlockerOpts<TRouter, TWithResolver>,
): {
  read: () => BlockerResolver<TRouter>
  update: (opts: UseBlockerOpts<TRouter, TWithResolver>) => void
}
/**
 * @deprecated Pass `{ shouldBlockFn }` as the opts object instead.
 */
export function useBlocker(
  handle: Handle<any, any>,
  blockerFn?: LegacyBlockerFn,
  condition?: boolean | any,
): {
  read: () => BlockerResolver
  update: (opts: UseBlockerOpts) => void
}
/**
 * @deprecated Pass `{ shouldBlockFn }` as the opts object instead.
 */
export function useBlocker(
  handle: Handle<any, any>,
  legacyOpts?: LegacyBlockerOpts,
): {
  read: () => BlockerResolver
  update: (opts: UseBlockerOpts) => void
}
export function useBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  handle: Handle<any, any>,
  initialOpts?:
    | UseBlockerOpts<TRouter, TWithResolver>
    | LegacyBlockerOpts
    | LegacyBlockerFn,
  condition?: boolean | any,
): {
  read: () => BlockerResolver<TRouter>
  update: (opts: UseBlockerOpts<TRouter, TWithResolver>) => void
} {
  const resolved = _resolveBlockerOpts<TRouter, TWithResolver>(
    initialOpts,
    condition,
  )
  return _useBlockerImpl<TRouter, TWithResolver>(handle, resolved)
}

function _useBlockerImpl<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  handle: Handle<any, any>,
  initialOpts: UseBlockerOpts<TRouter, TWithResolver>,
): {
  read: () => BlockerResolver<TRouter>
  update: (opts: UseBlockerOpts<TRouter, TWithResolver>) => void
} {
  const router = useRouter(handle)

  // Mutable ref for opts so the closure-bound blockerFn reads the
  // CURRENT values on every navigation, not whatever was passed at
  // setup. Without this, parents that change `shouldBlockFn` /
  // `disabled` between renders would see stale behavior — and
  // re-registering the blocker on prop change leaks the previous one
  // (router.history.block() returns a teardown that's never called
  // until handle.signal aborts).
  let currentOpts: UseBlockerOpts<TRouter, TWithResolver> = initialOpts
  let resolver: BlockerResolver<TRouter> = idleResolver as any

  function setResolver(next: any) {
    resolver = next
    void handle.update()
  }

  const blockerFnComposed = async (args: BlockerFnArgs) => {
    if (currentOpts.disabled) return false

    function getLocation(loc: HistoryLocation): AnyShouldBlockFnLocation {
      const parsed = router.parseLocation(loc)
      const matched = router.getMatchedRoutes(parsed.pathname)
      if (matched.foundRoute === undefined) {
        return {
          routeId: '__notFound__',
          fullPath: parsed.pathname,
          pathname: parsed.pathname,
          params: matched.routeParams,
          search: router.options.parseSearch(loc.search),
        }
      }
      return {
        routeId: matched.foundRoute.id,
        fullPath: matched.foundRoute.fullPath,
        pathname: parsed.pathname,
        params: matched.routeParams,
        search: router.options.parseSearch(loc.search),
      }
    }

    const current = getLocation(args.currentLocation)
    const next = getLocation(args.nextLocation)
    if (
      current.routeId === '__notFound__' &&
      next.routeId !== '__notFound__'
    ) {
      return false
    }

    const shouldBlock = await currentOpts.shouldBlockFn({
      action: args.action,
      current: current as any,
      next: next as any,
    })
    const withResolver = currentOpts.withResolver ?? false
    if (!withResolver) return shouldBlock
    if (!shouldBlock) return false

    const promise = new Promise<boolean>((resolve) => {
      setResolver({
        status: 'blocked',
        current: current as any,
        next: next as any,
        action: args.action,
        proceed: () => resolve(false),
        reset: () => resolve(true),
      } as any)
    })
    const canNavigateAsync = await promise
    setResolver(idleResolver as any)
    return canNavigateAsync
  }

  // Always register `enableBeforeUnload` as a function so the
  // history layer reads the CURRENT value at navigation time. Without
  // this, flipping `enableBeforeUnload` via `update(opts)` would have
  // no effect — the boolean would have been frozen at setup-time.
  const unblock = router.history.block({
    blockerFn: blockerFnComposed,
    enableBeforeUnload: () => {
      const v = currentOpts.enableBeforeUnload
      if (typeof v === 'function') return v()
      return v ?? true
    },
  })
  handle.signal.addEventListener('abort', unblock, { once: true })

  const update = ((opts?: any, condition?: any) => {
    // `update` accepts modern OR legacy shapes (function-pair or
    // legacy object) and re-resolves through `_resolveBlockerOpts`.
    // This is the legacy-form's reactivity escape hatch: the user can
    // call `update(blockerFn, latestCondition)` from the render
    // function on each render to refresh `condition`, since the
    // closure for the function-pair form captures `condition` as a
    // primitive and can't track in-place mutations.
    currentOpts = _resolveBlockerOpts<TRouter, TWithResolver>(
      opts,
      condition,
    )
  }) as BlockerUpdate<TRouter, TWithResolver>

  return {
    read: () => resolver,
    update,
  }
}

export interface BlockProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
> extends UseBlockerOpts<TRouter, TWithResolver> {
  /**
   * Render the resolver-aware UI as a regular prop. Use this instead
   * of function-as-children — Remix UI's JSX runtime drops function
   * values during the children-flatten step, so passing a function
   * via `children` does NOT work in this binding (it works in
   * React/Solid where the runtime preserves it).
   *
   * Mirrors the same pattern `<Await render={...}/>` uses for the
   * same reason.
   */
  render?: (resolver: BlockerResolver<TRouter>) => RemixNode
  children?:
    | RemixNode
    | ((resolver: BlockerResolver<TRouter>) => RemixNode)
}

/**
 * Component variant of `useBlocker`. Renders `render(resolver)` (if
 * provided), then falls back to `children` — vnode children render
 * as-is, and a function-as-children is invoked with the resolver
 * when it survives the JSX runtime (rare in this binding; prefer
 * `render`).
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/blockComponent
 */
export function Block<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
>(handle: Handle<BlockProps<TRouter, TWithResolver>>) {
  // Register the blocker ONCE at setup. Render-time updates flow
  // through `update(opts)` — no leaked blockers across opts changes.
  const initialProps = handle.props
  const { children: _initialChildren, render: _initialRender, ...initialOpts } =
    initialProps
  void _initialChildren
  void _initialRender
  const blocker = useBlocker(handle, initialOpts as any)

  return (props: BlockProps<TRouter, TWithResolver>): RemixNode => {
    const { children, render, ...opts } = props
    blocker.update(opts as any)
    if (typeof render === 'function') {
      return render(blocker.read() as BlockerResolver<TRouter>)
    }
    if (typeof children === 'function') {
      return (children as (r: BlockerResolver<TRouter>) => RemixNode)(
        blocker.read() as BlockerResolver<TRouter>,
      )
    }
    return (children ?? null) as RemixNode
  }
}
