import {
  BaseRootRoute,
  BaseRoute,
  BaseRouteApi,
  notFound,
} from '@tanstack/router-core'
import { createElement } from 'octane'
import { internalHooks } from './hooks'
import { useRouter } from './context'
import { splitSlot, subSlot } from './internal'
import { Link } from './Link.tsrx'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  ConstrainLiteral,
  NotFoundError,
  Register,
  RegisteredRouter,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRoute as RootRouteCore,
  RootRouteId,
  RootRouteOptions,
  RouteConstraints,
  Route as RouteCore,
  RouteIds,
  RouteMask,
  RouteOptions,
  RouteTypesById,
  RouterCore,
  ToMaskOptions,
  UseNavigateResult,
} from '@tanstack/router-core'
import type {
  UseLoaderDataRoute,
  UseLoaderDepsRoute,
  UseMatchRoute,
  UseParamsRoute,
  UseRouteContextRoute,
  UseSearchRoute,
} from './routeHookTypes'
import type { LinkComponentRoute } from './linkTypes'

function attachRouteHooks(self: any, strictLoaderHooks: boolean): void {
  self.useMatch = (...args: Array<any>) => {
    const [user, slot] = splitSlot(args)
    const opts = user[0] ?? {}
    return internalHooks.useMatch(
      {
        select: opts.select,
        structuralSharing: opts.structuralSharing,
        from: self.id,
      },
      subSlot(slot, 'r:m'),
    )
  }
  self.useRouteContext = (...args: Array<any>) => {
    const [user, slot] = splitSlot(args)
    return internalHooks.useRouteContext(
      { ...(user[0] ?? {}), from: self.id },
      subSlot(slot, 'r:ctx'),
    )
  }
  self.useSearch = (...args: Array<any>) => {
    const [user, slot] = splitSlot(args)
    const opts = user[0] ?? {}
    return internalHooks.useSearch(
      {
        select: opts.select,
        structuralSharing: opts.structuralSharing,
        from: self.id,
      },
      subSlot(slot, 'r:s'),
    )
  }
  self.useParams = (...args: Array<any>) => {
    const [user, slot] = splitSlot(args)
    const opts = user[0] ?? {}
    return internalHooks.useParams(
      {
        select: opts.select,
        structuralSharing: opts.structuralSharing,
        from: self.id,
      },
      subSlot(slot, 'r:p'),
    )
  }
  self.useLoaderDeps = (...args: Array<any>) => {
    const [user, slot] = splitSlot(args)
    const opts = user[0] ?? {}
    return internalHooks.useLoaderDeps(
      strictLoaderHooks
        ? { ...opts, from: self.id }
        : { ...opts, from: self.id, strict: false },
      subSlot(slot, 'r:d'),
    )
  }
  self.useLoaderData = (...args: Array<any>) => {
    const [user, slot] = splitSlot(args)
    const opts = user[0] ?? {}
    return internalHooks.useLoaderData(
      strictLoaderHooks
        ? { ...opts, from: self.id }
        : { ...opts, from: self.id, strict: false },
      subSlot(slot, 'r:l'),
    )
  }
}

function attachRouteNavigation(self: any): void {
  self.useNavigate = (...args: Array<any>) => {
    const [, slot] = splitSlot(args)
    return internalHooks.useNavigate(
      { from: self.fullPath },
      subSlot(slot, 'r:n'),
    )
  }
  self.Link = (props: Record<string, unknown>) =>
    createElement(Link as any, { from: self.fullPath, ...props })
}

export function getRouteApi<
  const TId,
  TRouter extends AnyRouter = RegisteredRouter,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return new RouteApi<TId, TRouter>({ id })
}

export class RouteApi<
  TId,
  TRouter extends AnyRouter = RegisteredRouter,
> extends BaseRouteApi<TId, TRouter> {
  declare useMatch: UseMatchRoute<TId>
  declare useRouteContext: UseRouteContextRoute<TId>
  declare useSearch: UseSearchRoute<TId>
  declare useParams: UseParamsRoute<TId>
  declare useLoaderDeps: UseLoaderDepsRoute<TId>
  declare useLoaderData: UseLoaderDataRoute<TId>
  declare useNavigate: () => UseNavigateResult<
    RouteTypesById<TRouter, TId>['fullPath']
  >
  declare Link: LinkComponentRoute<RouteTypesById<TRouter, TId>['fullPath']>

  /** @deprecated Use the `getRouteApi` function instead. */
  constructor({ id }: { id: TId }) {
    super({ id })
    attachRouteHooks(this, false)
    this.useNavigate = ((...args: Array<any>) => {
      const [, slot] = splitSlot(args)
      const router = useRouter()
      return internalHooks.useNavigate(
        {
          from: (router.routesById as Record<string, any>)[this.id as string]
            .fullPath,
        },
        subSlot(slot, 'r:n'),
      )
    }) as typeof this.useNavigate
    this.Link = ((props: Record<string, unknown>) => {
      const router = useRouter()
      const fullPath = (router.routesById as Record<string, any>)[
        this.id as string
      ].fullPath
      return createElement(Link as any, { from: fullPath, ...props })
    }) as unknown as typeof this.Link
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id, ...opts } as NotFoundError)
  }
}

export class Route<
  in out TRegister = unknown,
  in out TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  in out TPath extends RouteConstraints['TPath'] = '/',
  in out TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  in out TCustomId extends RouteConstraints['TCustomId'] = string,
  in out TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  in out TSearchValidator = undefined,
  in out TParams = ResolveParams<TPath>,
  in out TRouterContext = AnyContext,
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
>
  extends BaseRoute<
    TRegister,
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TSearchValidator,
    TParams,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren,
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  implements
    RouteCore<
      TRegister,
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
      TId,
      TSearchValidator,
      TParams,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TChildren,
      TFileRouteTypes,
      TSSR,
      TServerMiddlewares,
      THandlers
    >
{
  declare useMatch: UseMatchRoute<TId>
  declare useRouteContext: UseRouteContextRoute<TId>
  declare useSearch: UseSearchRoute<TId>
  declare useParams: UseParamsRoute<TId>
  declare useLoaderDeps: UseLoaderDepsRoute<TId>
  declare useLoaderData: UseLoaderDataRoute<TId>
  declare useNavigate: () => UseNavigateResult<TFullPath>
  declare Link: LinkComponentRoute<TFullPath>

  /** @deprecated Use the `createRoute` function instead. */
  constructor(
    options?: RouteOptions<
      TRegister,
      TParentRoute,
      TId,
      TCustomId,
      TFullPath,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TSSR,
      TServerMiddlewares,
      THandlers
    >,
  ) {
    super(options)
    attachRouteHooks(this, true)
    attachRouteNavigation(this)
  }
}

export function createRoute<
  TRegister = unknown,
  TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  TPath extends RouteConstraints['TPath'] = '/',
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  TCustomId extends RouteConstraints['TCustomId'] = string,
  TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TSSR = unknown,
  const TServerMiddlewares = unknown,
>(
  options: RouteOptions<
    TRegister,
    TParentRoute,
    TId,
    TCustomId,
    TFullPath,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    AnyContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares
  >,
): Route<
  TRegister,
  TParentRoute,
  TPath,
  TFullPath,
  TCustomId,
  TId,
  TSearchValidator,
  TParams,
  AnyContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  unknown,
  TSSR,
  TServerMiddlewares
> {
  return new Route(options as any)
}

export type AnyRootRoute = RootRoute<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export function createRootRouteWithContext<TRouterContext extends {}>() {
  return <
    TRegister = Register,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TSearchValidator = undefined,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TSSR = unknown,
    TServerMiddlewares = unknown,
  >(
    options?: RootRouteOptions<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares
    >,
  ) =>
    createRootRoute<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares
    >(options)
}

/** @deprecated Use the `createRootRouteWithContext` function instead. */
export const rootRouteWithContext = createRootRouteWithContext

export class RootRoute<
  in out TRegister = unknown,
  in out TSearchValidator = undefined,
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
>
  extends BaseRootRoute<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren,
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  implements
    RootRouteCore<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TChildren,
      TFileRouteTypes,
      TSSR,
      TServerMiddlewares,
      THandlers
    >
{
  declare useMatch: UseMatchRoute<RootRouteId>
  declare useRouteContext: UseRouteContextRoute<RootRouteId>
  declare useSearch: UseSearchRoute<RootRouteId>
  declare useParams: UseParamsRoute<RootRouteId>
  declare useLoaderDeps: UseLoaderDepsRoute<RootRouteId>
  declare useLoaderData: UseLoaderDataRoute<RootRouteId>
  declare useNavigate: () => UseNavigateResult<'/'>
  declare Link: LinkComponentRoute<'/'>

  /** @deprecated Use `createRootRoute()` instead. */
  constructor(
    options?: RootRouteOptions<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares,
      THandlers
    >,
  ) {
    super(options)
    attachRouteHooks(this, true)
    attachRouteNavigation(this)
  }
}

export function createRootRoute<
  TRegister = Register,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  const TServerMiddlewares = unknown,
  THandlers = undefined,
>(
  options?: RootRouteOptions<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TSSR,
    TServerMiddlewares,
    THandlers
  >,
): RootRoute<
  TRegister,
  TSearchValidator,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  unknown,
  unknown,
  TSSR,
  TServerMiddlewares,
  THandlers
> {
  return new RootRoute(options)
}

export function createRouteMask<
  TRouteTree extends AnyRoute,
  TFrom extends string,
  TTo extends string,
>(
  opts: {
    routeTree: TRouteTree
  } & ToMaskOptions<RouterCore<TRouteTree, 'never', boolean>, TFrom, TTo>,
): RouteMask<TRouteTree> {
  return opts as any
}

export class NotFoundRoute<
  TRegister,
  TParentRoute extends AnyRootRoute,
  TRouterContext = AnyContext,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TSearchValidator = undefined,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TSSR = unknown,
  TServerMiddlewares = unknown,
> extends Route<
  TRegister,
  TParentRoute,
  '/404',
  '/404',
  '404',
  '404',
  TSearchValidator,
  {},
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  unknown,
  TSSR,
  TServerMiddlewares
> {
  constructor(
    options: Omit<
      RouteOptions<
        TRegister,
        TParentRoute,
        string,
        string,
        string,
        string,
        TSearchValidator,
        {},
        TLoaderDeps,
        TLoaderFn,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn,
        TSSR,
        TServerMiddlewares
      >,
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
      | 'path'
      | 'id'
      | 'params'
    >,
  ) {
    super({ ...(options as any), id: '404' })
  }
}
