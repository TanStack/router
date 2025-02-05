export type IsRequiredParams<TParams> =
  Record<never, never> extends TParams ? never : true

export type ParsePathParams<T extends string, TAcc = never> = T &
  `${string}$${string}` extends never
  ? TAcc
  : T extends `${string}$${infer TPossiblyParam}`
    ? TPossiblyParam extends ''
      ? TAcc
      : TPossiblyParam & `${string}/${string}` extends never
        ? TPossiblyParam | TAcc
        : TPossiblyParam extends `${infer TParam}/${infer TRest}`
          ? ParsePathParams<TRest, TParam extends '' ? TAcc : TParam | TAcc>
          : never
    : TAcc

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

export interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
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
}

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

export type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export const preloadWarning = 'Error preloading route! ☝️'
