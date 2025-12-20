import type { HistoryState, ParsedHistoryState } from '@tanstack/history'
import type {
  AllParams,
  CatchAllPaths,
  CurrentPath,
  FullSearchSchema,
  FullSearchSchemaInput,
  ParentPath,
  RouteByPath,
  RouteByToPath,
  RoutePaths,
  RouteToPath,
  ToPath,
} from './routeInfo'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  ViewTransitionOptions,
} from './router'
import type {
  ConstrainLiteral,
  Expand,
  MakeDifferenceOptional,
  NoInfer,
  NonNullableUpdater,
  Updater,
} from './utils'
import type { ParsedLocation } from './location'

export type IsRequiredParams<TParams> =
  Record<never, never> extends TParams ? never : true

export interface ParsePathParamsResult<
  in out TRequired,
  in out TOptional,
  in out TRest,
> {
  required: TRequired
  optional: TOptional
  rest: TRest
}

export type AnyParsePathParamsResult = ParsePathParamsResult<
  string,
  string,
  string
>

export type ParsePathParamsBoundaryStart<T extends string> =
  T extends `${infer TLeft}{-${infer TRight}`
    ? ParsePathParamsResult<
        ParsePathParams<TLeft>['required'],
        | ParsePathParams<TLeft>['optional']
        | ParsePathParams<TRight>['required']
        | ParsePathParams<TRight>['optional'],
        ParsePathParams<TRight>['rest']
      >
    : T extends `${infer TLeft}{${infer TRight}`
      ? ParsePathParamsResult<
          | ParsePathParams<TLeft>['required']
          | ParsePathParams<TRight>['required'],
          | ParsePathParams<TLeft>['optional']
          | ParsePathParams<TRight>['optional'],
          ParsePathParams<TRight>['rest']
        >
      : never

export type ParsePathParamsSymbol<T extends string> =
  T extends `${string}$${infer TRight}`
    ? TRight extends `${string}/${string}`
      ? TRight extends `${infer TParam}/${infer TRest}`
        ? TParam extends ''
          ? ParsePathParamsResult<
              ParsePathParams<TRest>['required'],
              '_splat' | ParsePathParams<TRest>['optional'],
              ParsePathParams<TRest>['rest']
            >
          : ParsePathParamsResult<
              TParam | ParsePathParams<TRest>['required'],
              ParsePathParams<TRest>['optional'],
              ParsePathParams<TRest>['rest']
            >
        : never
      : TRight extends ''
        ? ParsePathParamsResult<never, '_splat', never>
        : ParsePathParamsResult<TRight, never, never>
    : never

export type ParsePathParamsBoundaryEnd<T extends string> =
  T extends `${infer TLeft}}${infer TRight}`
    ? ParsePathParamsResult<
        | ParsePathParams<TLeft>['required']
        | ParsePathParams<TRight>['required'],
        | ParsePathParams<TLeft>['optional']
        | ParsePathParams<TRight>['optional'],
        ParsePathParams<TRight>['rest']
      >
    : never

export type ParsePathParamsEscapeStart<T extends string> =
  T extends `${infer TLeft}[${infer TRight}`
    ? ParsePathParamsResult<
        | ParsePathParams<TLeft>['required']
        | ParsePathParams<TRight>['required'],
        | ParsePathParams<TLeft>['optional']
        | ParsePathParams<TRight>['optional'],
        ParsePathParams<TRight>['rest']
      >
    : never

export type ParsePathParamsEscapeEnd<T extends string> =
  T extends `${string}]${infer TRight}` ? ParsePathParams<TRight> : never

export type ParsePathParams<T extends string> = T extends `${string}[${string}`
  ? ParsePathParamsEscapeStart<T>
  : T extends `${string}]${string}`
    ? ParsePathParamsEscapeEnd<T>
    : T extends `${string}}${string}`
      ? ParsePathParamsBoundaryEnd<T>
      : T extends `${string}{${string}`
        ? ParsePathParamsBoundaryStart<T>
        : T extends `${string}$${string}`
          ? ParsePathParamsSymbol<T>
          : never

export type AddTrailingSlash<T> = T extends `${string}/` ? T : `${T & string}/`

export type RemoveTrailingSlashes<T> = T & `${string}/` extends never
  ? T
  : T extends `${infer R}/`
    ? R
    : T

export type AddLeadingSlash<T> = T & `/${string}` extends never
  ? `/${T & string}`
  : T

export type RemoveLeadingSlashes<T> = T & `/${string}` extends never
  ? T
  : T extends `/${infer R}`
    ? R
    : T

type JoinPath<TLeft extends string, TRight extends string> = TRight extends ''
  ? TLeft
  : TLeft extends ''
    ? TRight
    : `${RemoveTrailingSlashes<TLeft>}/${RemoveLeadingSlashes<TRight>}`

type RemoveLastSegment<
  T extends string,
  TAcc extends string = '',
> = T extends `${infer TSegment}/${infer TRest}`
  ? TRest & `${string}/${string}` extends never
    ? TRest extends ''
      ? TAcc
      : `${TAcc}${TSegment}`
    : RemoveLastSegment<TRest, `${TAcc}${TSegment}/`>
  : TAcc

export type ResolveCurrentPath<
  TFrom extends string,
  TTo extends string,
> = TTo extends '.'
  ? TFrom
  : TTo extends './'
    ? AddTrailingSlash<TFrom>
    : TTo & `./${string}` extends never
      ? never
      : TTo extends `./${infer TRest}`
        ? AddLeadingSlash<JoinPath<TFrom, TRest>>
        : never

export type ResolveParentPath<
  TFrom extends string,
  TTo extends string,
> = TTo extends '../' | '..'
  ? TFrom extends '' | '/'
    ? never
    : AddLeadingSlash<RemoveLastSegment<TFrom>>
  : TTo & `../${string}` extends never
    ? AddLeadingSlash<JoinPath<TFrom, TTo>>
    : TFrom extends '' | '/'
      ? never
      : TTo extends `../${infer ToRest}`
        ? ResolveParentPath<RemoveLastSegment<TFrom>, ToRest>
        : AddLeadingSlash<JoinPath<TFrom, TTo>>

export type ResolveRelativePath<TFrom, TTo = '.'> = string extends TFrom
  ? TTo
  : string extends TTo
    ? TFrom
    : undefined extends TTo
      ? TFrom
      : TTo extends string
        ? TFrom extends string
          ? TTo extends `/${string}`
            ? TTo
            : TTo extends `..${string}`
              ? ResolveParentPath<TFrom, TTo>
              : TTo extends `.${string}`
                ? ResolveCurrentPath<TFrom, TTo>
                : AddLeadingSlash<JoinPath<TFrom, TTo>>
          : never
        : never

export type FindDescendantToPaths<
  TRegister extends Register,
  TPrefix extends string,
> = `${TPrefix}/${string}` & RouteToPath<TRegister>

export type InferDescendantToPaths<
  TRegister extends Register,
  TPrefix extends string,
  TPaths = FindDescendantToPaths<TRegister, TPrefix>,
> = TPaths extends `${TPrefix}/`
  ? never
  : TPaths extends `${TPrefix}/${infer TRest}`
    ? TRest
    : never

export type RelativeToPath<
  TRegister extends Register,
  TTo extends string,
  TResolvedPath extends string,
> =
  | (TResolvedPath & RouteToPath<TRegister> extends never
      ? never
      : ToPath<TRegister, TTo>)
  | `${RemoveTrailingSlashes<TTo>}/${InferDescendantToPaths<TRegister, RemoveTrailingSlashes<TResolvedPath>>}`

export type RelativeToParentPath<
  TRegister extends Register,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = ResolveRelativePath<TFrom, TTo>,
> =
  | RelativeToPath<TRegister, TTo, TResolvedPath>
  | (TTo extends `${string}..` | `${string}../`
      ? TResolvedPath extends '/' | ''
        ? never
        : FindDescendantToPaths<
              TRegister,
              RemoveTrailingSlashes<TResolvedPath>
            > extends never
          ? never
          : `${RemoveTrailingSlashes<TTo>}/${ParentPath<TRegister>}`
      : never)

export type RelativeToCurrentPath<
  TRegister extends Register,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = ResolveRelativePath<TFrom, TTo>,
> = RelativeToPath<TRegister, TTo, TResolvedPath> | CurrentPath<TRegister>

export type AbsoluteToPath<TRegister extends Register, TFrom extends string> =
  | (string extends TFrom
      ? CurrentPath<TRegister>
      : TFrom extends `/`
        ? never
        : CurrentPath<TRegister>)
  | (string extends TFrom
      ? ParentPath<TRegister>
      : TFrom extends `/`
        ? never
        : ParentPath<TRegister>)
  | RouteToPath<TRegister>
  | (TFrom extends '/'
      ? never
      : string extends TFrom
        ? never
        : InferDescendantToPaths<TRegister, RemoveTrailingSlashes<TFrom>>)

export type RelativeToPathAutoComplete<
  TRegister extends Register,
  TFrom extends string,
  TTo extends string,
> = string extends TTo
  ? string
  : string extends TFrom
    ? AbsoluteToPath<TRegister, TFrom>
    : TTo & `..${string}` extends never
      ? TTo & `.${string}` extends never
        ? AbsoluteToPath<TRegister, TFrom>
        : RelativeToCurrentPath<TRegister, TFrom, TTo>
      : RelativeToParentPath<TRegister, TFrom, TTo>

export type NavigateOptions<
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ToOptions<TRegister, TFrom, TTo, TMaskFrom, TMaskTo> & NavigateOptionProps

/**
 * The NavigateOptions type is used to describe the options that can be used when describing a navigation action in TanStack Router.
 * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType)
 */
export interface NavigateOptionProps {
  /**
   * If set to `true`, the router will scroll the element with an id matching the hash into view with default `ScrollIntoViewOptions`.
   * If set to `false`, the router will not scroll the element with an id matching the hash into view.
   * If set to `ScrollIntoViewOptions`, the router will scroll the element with an id matching the hash into view with the provided options.
   * @default true
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#hashscrollintoview)
   * @see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)
   */
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  /**
   * `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#replace)
   */
  replace?: boolean
  /**
   * Defaults to `true` so that the scroll position will be reset to 0,0 after the location is committed to the browser history.
   * If `false`, the scroll position will not be reset to 0,0 after the location is committed to history.
   * @default true
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#resetscroll)
   */
  resetScroll?: boolean
  /** @deprecated All navigations now use startTransition under the hood */
  startTransition?: boolean
  /**
   * If set to `true`, the router will wrap the resulting navigation in a `document.startViewTransition()` call.
   * If `ViewTransitionOptions`, route navigations will be called using `document.startViewTransition({update, types})`
   * where `types` will be the strings array passed with `ViewTransitionOptions["types"]`.
   * If the browser does not support viewTransition types, the navigation will fall back to normal `document.startTransition()`, same as if `true` was passed.
   *
   * If the browser does not support this api, this option will be ignored.
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#viewtransition)
   * @see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition)
   * @see [Google](https://developer.chrome.com/docs/web-platform/view-transitions/same-document#view-transition-types)
   */
  viewTransition?: boolean | ViewTransitionOptions
  /**
   * If `true`, navigation will ignore any blockers that might prevent it.
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#ignoreblocker)
   */
  ignoreBlocker?: boolean
  /**
   * If `true`, navigation to a route inside of router will trigger a full page load instead of the traditional SPA navigation.
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#reloaddocument)
   */
  reloadDocument?: boolean
  /**
   * This can be used instead of `to` to navigate to a fully built href, e.g. pointing to an external target.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#href)
   */
  href?: string
}

export type ToOptions<
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ToSubOptions<TRegister, TFrom, TTo> &
  MaskOptions<TRegister, TMaskFrom, TMaskTo>

export interface MaskOptions<
  in out TRegister extends Register,
  in out TMaskFrom extends string,
  in out TMaskTo extends string,
> {
  _fromLocation?: ParsedLocation
  mask?: ToMaskOptions<TRegister, TMaskFrom, TMaskTo>
}

export type ToMaskOptions<
  TRegister extends Register = Register,
  TMaskFrom extends string = string,
  TMaskTo extends string = '.',
> = ToSubOptions<TRegister, TMaskFrom, TMaskTo> & {
  unmaskOnReload?: boolean
}

export type ToSubOptions<
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
> = ToSubOptionsProps<TRegister, TFrom, TTo> &
  SearchParamOptions<TRegister, TFrom, TTo> &
  PathParamOptions<TRegister, TFrom, TTo>

export interface RequiredToOptions<
  in out TRegister extends Register,
  in out TFrom extends string,
  in out TTo extends string | undefined,
> {
  /**
   * The internal route path to navigate to. This should be a relative or absolute path within your application.
   * For external URLs, use the `href` property instead.
   * @example "/dashboard" or "../profile"
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#href)
   */
  to: ToPathOption<TRegister, TFrom, TTo> & {}
}

export interface OptionalToOptions<
  in out TRegister extends Register,
  in out TFrom extends string,
  in out TTo extends string | undefined,
> {
  /**
   * The internal route path to navigate to. This should be a relative or absolute path within your application.
   * For external URLs, use the `href` property instead.
   * @example "/dashboard" or "../profile"
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType#href)
   */
  to?: ToPathOption<TRegister, TFrom, TTo> & {}
}

export type MakeToRequired<
  TRegister extends Register,
  TFrom extends string,
  TTo extends string | undefined,
> = string extends TFrom
  ? string extends TTo
    ? OptionalToOptions<TRegister, TFrom, TTo>
    : TTo extends CatchAllPaths<TRegister>
      ? RequiredToOptions<TRegister, TFrom, TTo>
      : OptionalToOptions<TRegister, TFrom, TTo>
  : OptionalToOptions<TRegister, TFrom, TTo>

export type ToSubOptionsProps<
  TRegister extends Register = Register,
  TFrom extends
    | (RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
        ? RoutePaths<TRouter['routeTree']>
        : never)
    | string = string,
  TTo extends string | undefined = '.',
> = MakeToRequired<TRegister, TFrom, TTo> & {
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>
  from?: FromPathOption<TRegister, TFrom> & {}
  unsafeRelative?: 'path'
}

export type ParamsReducerFn<
  in out TRegister extends Register,
  in out TParamVariant extends ParamVariant,
  in out TFrom,
  in out TTo,
> = (
  current: Expand<ResolveFromParams<TRegister, TParamVariant, TFrom>>,
) => Expand<ResolveRelativeToParams<TRegister, TParamVariant, TFrom, TTo>>

type ParamsReducer<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  | Expand<ResolveRelativeToParams<TRegister, TParamVariant, TFrom, TTo>>
  | (ParamsReducerFn<TRegister, TParamVariant, TFrom, TTo> & {})

type ParamVariant = 'PATH' | 'SEARCH'

export type ResolveRoute<
  TRegister extends Register,
  TFrom,
  TTo,
  TPath = ResolveRelativePath<TFrom, TTo>,
> = TPath extends string
  ? TFrom extends TPath
    ? RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
      ? RouteByPath<TRouter['routeTree'], TPath>
      : never
    : RouteByToPath<TRegister, TPath>
  : never

type ResolveFromParamType<TParamVariant extends ParamVariant> =
  TParamVariant extends 'PATH' ? 'allParams' : 'fullSearchSchema'

type ResolveFromAllParams<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
> = TParamVariant extends 'PATH'
  ? RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? AllParams<TRouter['routeTree']>
    : never
  : RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? FullSearchSchema<TRouter['routeTree']>
    : never

type ResolveFromParams<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
  TFrom,
> = string extends TFrom
  ? ResolveFromAllParams<TRegister, TParamVariant>
  : RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? RouteByPath<
        TRouter['routeTree'],
        TFrom
      >['types'][ResolveFromParamType<TParamVariant>]
    : never

type ResolveToParamType<TParamVariant extends ParamVariant> =
  TParamVariant extends 'PATH' ? 'allParams' : 'fullSearchSchemaInput'

type ResolveAllToParams<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
> = TParamVariant extends 'PATH'
  ? RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? AllParams<TRouter['routeTree']>
    : never
  : RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? FullSearchSchemaInput<TRouter['routeTree']>
    : never

export type ResolveToParams<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  ResolveRelativePath<TFrom, TTo> extends infer TPath
    ? undefined extends TPath
      ? never
      : string extends TPath
        ? ResolveAllToParams<TRegister, TParamVariant>
        : TPath extends CatchAllPaths<TRegister>
          ? ResolveAllToParams<TRegister, TParamVariant>
          : ResolveRoute<
              TRegister,
              TFrom,
              TTo
            >['types'][ResolveToParamType<TParamVariant>]
    : never

type ResolveRelativeToParams<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
  TToParams = ResolveToParams<TRegister, TParamVariant, TFrom, TTo>,
> = TParamVariant extends 'SEARCH'
  ? TToParams
  : string extends TFrom
    ? TToParams
    : MakeDifferenceOptional<
        ResolveFromParams<TRegister, TParamVariant, TFrom>,
        TToParams
      >

export interface MakeOptionalSearchParams<
  in out TRegister extends Register,
  in out TFrom,
  in out TTo,
> {
  search?: true | (ParamsReducer<TRegister, 'SEARCH', TFrom, TTo> & {})
}

export interface MakeOptionalPathParams<
  in out TRegister extends Register,
  in out TFrom,
  in out TTo,
> {
  params?: true | (ParamsReducer<TRegister, 'PATH', TFrom, TTo> & {})
}

type MakeRequiredParamsReducer<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  | (string extends TFrom
      ? never
      : ResolveFromParams<
            TRegister,
            TParamVariant,
            TFrom
          > extends ResolveRelativeToParams<
            TRegister,
            TParamVariant,
            TFrom,
            TTo
          >
        ? true
        : never)
  | (ParamsReducer<TRegister, TParamVariant, TFrom, TTo> & {})

export interface MakeRequiredPathParams<
  in out TRegister extends Register,
  in out TFrom,
  in out TTo,
> {
  params: MakeRequiredParamsReducer<TRegister, 'PATH', TFrom, TTo> & {}
}

export interface MakeRequiredSearchParams<
  in out TRegister extends Register,
  in out TFrom,
  in out TTo,
> {
  search: MakeRequiredParamsReducer<TRegister, 'SEARCH', TFrom, TTo> & {}
}

export type IsRequired<
  TRegister extends Register,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  ResolveRelativePath<TFrom, TTo> extends infer TPath
    ? undefined extends TPath
      ? never
      : TPath extends CatchAllPaths<TRegister>
        ? never
        : IsRequiredParams<
            ResolveRelativeToParams<TRegister, TParamVariant, TFrom, TTo>
          >
    : never

export type SearchParamOptions<TRegister extends Register, TFrom, TTo> =
  IsRequired<TRegister, 'SEARCH', TFrom, TTo> extends never
    ? MakeOptionalSearchParams<TRegister, TFrom, TTo>
    : MakeRequiredSearchParams<TRegister, TFrom, TTo>

export type PathParamOptions<TRegister extends Register, TFrom, TTo> =
  IsRequired<TRegister, 'PATH', TFrom, TTo> extends never
    ? MakeOptionalPathParams<TRegister, TFrom, TTo>
    : MakeRequiredPathParams<TRegister, TFrom, TTo>

export type ToPathOption<
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = string,
> = ConstrainLiteral<
  TTo,
  RelativeToPathAutoComplete<
    TRegister,
    NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
    NoInfer<TTo> & string
  >
>

export type FromPathOption<
  TRegister extends Register,
  TFrom,
> = ConstrainLiteral<
  TFrom,
  RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? RoutePaths<TRouter['routeTree']>
    : never
>

/**
 * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/navigation#active-options)
 */
export interface ActiveOptions {
  /**
   * If true, the link will be active if the current route matches the `to` route path exactly (no children routes)
   * @default false
   */
  exact?: boolean
  /**
   * If true, the link will only be active if the current URL hash matches the `hash` prop
   * @default false
   */
  includeHash?: boolean
  /**
   * If true, the link will only be active if the current URL search params inclusively match the `search` prop
   * @default true
   */
  includeSearch?: boolean
  /**
   * This modifies the `includeSearch` behavior.
   * If true,  properties in `search` that are explicitly `undefined` must NOT be present in the current URL search params for the link to be active.
   * @default false
   */
  explicitUndefined?: boolean
}

export interface LinkOptionsProps {
  /**
   * The standard anchor tag target attribute
   */
  target?: HTMLAnchorElement['target']
  /**
   * Configurable options to determine if the link should be considered active or not
   * @default {exact:true,includeHash:true}
   */
  activeOptions?: ActiveOptions
  /**
   * The preloading strategy for this link
   * - `false` - No preloading
   * - `'intent'` - Preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
   * - `'viewport'` - Preload the linked route when it enters the viewport
   */
  preload?: false | 'intent' | 'viewport' | 'render'
  /**
   * When a preload strategy is set, this delays the preload by this many milliseconds.
   * If the user exits the link before this delay, the preload will be cancelled.
   */
  preloadDelay?: number
  /**
   * Control whether the link should be disabled or not
   * If set to `true`, the link will be rendered without an `href` attribute
   * @default false
   */
  disabled?: boolean
  /**
   * When the preload strategy is set to `intent`, this controls the proximity of the link to the cursor before it is preloaded.
   * If the user exits this proximity before this delay, the preload will be cancelled.
   */
  preloadIntentProximity?: number
}

export type LinkOptions<
  TRegister extends Register = Register,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = NavigateOptions<TRegister, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkOptionsProps

export type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export const preloadWarning = 'Error preloading route! ☝️'
