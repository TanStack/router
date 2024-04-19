import warning from 'tiny-warning'
import { createRoute } from './route'
import { useLoaderData, useLoaderDeps, useMatch } from './Matches'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useNavigate } from './useNavigate'
import type { ParsePathParams } from './link'
import type {
  AnyContext,
  AnyPathParams,
  AnyRoute,
  AnySearchSchema,
  FileBaseRouteOptions,
  MergeFromFromParent,
  ResolveFullPath,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  RootRouteId,
  Route,
  RouteConstraints,
  RouteContext,
  RouteLoaderFn,
  SearchSchemaInput,
  TrimPathLeft,
  UpdatableRouteOptions,
} from './route'
import type { Assign, IsAny } from './utils'
import type { MakeRouteMatch } from './Matches'
import type { NoInfer } from '@tanstack/react-store'
import type { RegisteredRouter } from './router'
import type { RouteById, RouteIds } from './routeInfo'

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

type Replace<
  TValue extends string,
  TFrom extends string,
  TTo extends string,
  TAcc extends string = '',
> = TValue extends `${infer Start}${TFrom}${infer Rest}`
  ? Replace<Rest, TFrom, TTo, `${TAcc}${Start}${TTo}`>
  : `${TAcc}${TValue}`

export type TrimLeft<
  TValue extends string,
  TStartsWith extends string,
> = TValue extends `${TStartsWith}${infer U}` ? U : TValue

export type TrimRight<
  TValue extends string,
  TEndsWith extends string,
> = TValue extends `${infer U}${TEndsWith}` ? U : TValue

export type Trim<TValue extends string, TFind extends string> = TrimLeft<
  TrimRight<TValue, TFind>,
  TFind
>

export type RemoveUnderScores<T extends string> = Replace<
  Replace<TrimRight<TrimLeft<T, '/_'>, '_'>, '_/', '/'>,
  '/_',
  '/'
>

type RemoveRouteGroups<T extends string> =
  T extends `${infer Before}(${string})${infer After}`
    ? RemoveRouteGroups<`${Before}${After}`>
    : T

type NormalizeSlashes<T extends string> =
  T extends `${infer Before}//${infer After}`
    ? NormalizeSlashes<`${Before}/${After}`>
    : T

export type ResolveFilePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
> = TParentRoute['id'] extends RootRouteId
  ? TrimPathLeft<TFilePath>
  : TFilePath extends `${TParentRoute['types']['customId']}${infer TRest}`
    ? TRest
    : TFilePath

export type FileRoutePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
  TResolvedFilePath = ResolveFilePath<TParentRoute, TFilePath>,
> = TResolvedFilePath extends `_${string}`
  ? ''
  : TResolvedFilePath extends `/_${string}`
    ? ''
    : TResolvedFilePath

export function createFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = NormalizeSlashes<
    RemoveRouteGroups<TFilePath>
  >,
  TPath extends RouteConstraints['TPath'] = FileRoutePath<
    TParentRoute,
    TFilePath
  >,
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    NormalizeSlashes<RemoveRouteGroups<RemoveUnderScores<TPath>>>
  >,
>(path: TFilePath) {
  return new FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>(path, {
    silent: true,
  }).createRoute
}

/** 
  @deprecated It's no longer recommended to use the `FileRoute` class directly.
  Instead, use `createFileRoute('/path/to/file')(options)` to create a file route.
*/
export class FileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = TFilePath,
  TPath extends RouteConstraints['TPath'] = FileRoutePath<
    TParentRoute,
    TFilePath
  >,
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    RemoveUnderScores<TPath>
  >,
> {
  silent?: boolean

  constructor(
    public path: TFilePath,
    _opts?: { silent: boolean },
  ) {
    this.silent = _opts?.silent
  }

  createRoute = <
    TSearchSchemaInput extends RouteConstraints['TSearchSchema'] = {},
    TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
    TSearchSchemaUsed = TSearchSchemaInput extends SearchSchemaInput
      ? Omit<TSearchSchemaInput, keyof SearchSchemaInput>
      : TSearchSchema,
    TFullSearchSchemaInput = ResolveFullSearchSchemaInput<
      TParentRoute,
      TSearchSchemaUsed
    >,
    TFullSearchSchema = ResolveFullSearchSchema<TParentRoute, TSearchSchema>,
    TParams = Record<ParsePathParams<TPath>, string>,
    TAllParams = MergeFromFromParent<
      TParentRoute['types']['allParams'],
      TParams
    >,
    TRouteContextReturn extends
      RouteConstraints['TRouteContext'] = RouteContext,
    TRouteContext = [TRouteContextReturn] extends [never]
      ? RouteContext
      : TRouteContextReturn,
    TAllContext = Assign<
      IsAny<TParentRoute['types']['allContext'], {}>,
      TRouteContext
    >,
    TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderDataReturn = unknown,
    TLoaderData = [TLoaderDataReturn] extends [never]
      ? undefined
      : TLoaderDataReturn,
    TChildren extends RouteConstraints['TChildren'] = unknown,
  >(
    options?: FileBaseRouteOptions<
      TParentRoute,
      TPath,
      TSearchSchemaInput,
      TSearchSchema,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteContextReturn,
      TRouteContext,
      TRouterContext,
      TAllContext,
      TLoaderDeps,
      TLoaderDataReturn
    > &
      UpdatableRouteOptions<
        TId,
        TAllParams,
        TFullSearchSchema,
        TLoaderData,
        TAllContext,
        TRouteContext,
        TLoaderDeps
      >,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TFilePath,
    TId,
    TSearchSchemaInput,
    TSearchSchema,
    TSearchSchemaUsed,
    TFullSearchSchemaInput,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteContextReturn,
    TRouteContext,
    TAllContext,
    TRouterContext,
    TLoaderDeps,
    TLoaderDataReturn,
    TLoaderData,
    TChildren
  > => {
    warning(
      this.silent,
      'FileRoute is deprecated and will be removed in the next major version. Use the createFileRoute(path)(options) function instead.',
    )
    const route = createRoute(options as any)
    ;(route as any).isRoot = false
    return route as any
  }
}

/** 
  @deprecated It's recommended not to split loaders into separate files.
  Instead, place the loader function in the the main route file, inside the
  `createFileRoute('/path/to/file)(options)` options.
*/
export function FileRouteLoader<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(
  _path: TFilePath,
): <TLoaderData>(
  loaderFn: RouteLoaderFn<
    TRoute['types']['allParams'],
    TRoute['types']['loaderDeps'],
    TRoute['types']['allContext'],
    TRoute['types']['routeContext'],
    TLoaderData
  >,
) => RouteLoaderFn<
  TRoute['types']['allParams'],
  TRoute['types']['loaderDeps'],
  TRoute['types']['allContext'],
  TRoute['types']['routeContext'],
  NoInfer<TLoaderData>
> {
  warning(
    false,
    `FileRouteLoader is deprecated and will be removed in the next major version. Please place the loader function in the the main route file, inside the \`createFileRoute('/path/to/file')(options)\` options`,
  )
  return (loaderFn) => loaderFn
}

export type LazyRouteOptions = Pick<
  UpdatableRouteOptions<
    string,
    AnyPathParams,
    AnySearchSchema,
    {},
    AnyContext,
    AnyContext,
    {}
  >,
  'component' | 'errorComponent' | 'pendingComponent' | 'notFoundComponent'
>

export class LazyRoute<TRoute extends AnyRoute> {
  options: {
    id: string
  } & LazyRouteOptions

  constructor(
    opts: {
      id: string
    } & LazyRouteOptions,
  ) {
    this.options = opts
    ;(this as any).$$typeof = Symbol.for('react.memo')
  }

  useMatch = <
    TRouteMatch = MakeRouteMatch<
      RegisteredRouter['routeTree'],
      TRoute['types']['id']
    >,
    TSelected = TRouteMatch,
  >(opts?: {
    select?: (match: TRouteMatch) => TSelected
  }): TSelected => {
    return useMatch({ select: opts?.select, from: this.options.id })
  }

  useRouteContext = <TSelected = TRoute['types']['allContext']>(opts?: {
    select?: (s: TRoute['types']['allContext']) => TSelected
  }): TSelected => {
    return useMatch({
      from: this.options.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    })
  }

  useSearch = <TSelected = TRoute['types']['fullSearchSchema']>(opts?: {
    select?: (s: TRoute['types']['fullSearchSchema']) => TSelected
  }): TSelected => {
    return useSearch({ ...opts, from: this.options.id })
  }

  useParams = <TSelected = TRoute['types']['allParams']>(opts?: {
    select?: (s: TRoute['types']['allParams']) => TSelected
  }): TSelected => {
    return useParams({ ...opts, from: this.options.id })
  }

  useLoaderDeps = <TSelected = TRoute['types']['loaderDeps']>(opts?: {
    select?: (s: TRoute['types']['loaderDeps']) => TSelected
  }): TSelected => {
    return useLoaderDeps({ ...opts, from: this.options.id } as any)
  }

  useLoaderData = <TSelected = TRoute['types']['loaderData']>(opts?: {
    select?: (s: TRoute['types']['loaderData']) => TSelected
  }): TSelected => {
    return useLoaderData({ ...opts, from: this.options.id } as any)
  }

  useNavigate = () => {
    return useNavigate({ from: this.options.id })
  }
}

export function createLazyRoute<
  TId extends RouteIds<RegisteredRouter['routeTree']>,
  TRoute extends AnyRoute = RouteById<RegisteredRouter['routeTree'], TId>,
>(id: TId) {
  return (opts: LazyRouteOptions) => {
    return new LazyRoute<TRoute>({ id: id as any, ...opts })
  }
}

export function createLazyFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(path: TFilePath) {
  const id = removeGroups(path)
  return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts })
}

const routeGroupPatternRegex = /\(.+\)/g

function removeGroups(s: string) {
  return s.replaceAll(routeGroupPatternRegex, '').replaceAll('//', '/')
}
