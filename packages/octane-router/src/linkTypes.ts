import type { ComponentBody, ElementDescriptor } from 'octane'
import type {
  AnyRouter,
  LinkOptions,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'

export interface OctaneAnchorProps {
  children?: OctaneRenderable
  class?: unknown
  className?: string
  style?: unknown
  href?: string
  target?: string
  disabled?: boolean
  ref?: unknown
  onClick?: (event: MouseEvent) => void
  onBlur?: (event: FocusEvent) => void
  onFocus?: (event: FocusEvent) => void
  onMouseEnter?: (event: MouseEvent) => void
  onMouseLeave?: (event: MouseEvent) => void
  onTouchStart?: (event: TouchEvent) => void
  [key: string]: unknown
}

export type OctaneRenderable =
  | ElementDescriptor<unknown>
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | ReadonlyArray<OctaneRenderable>

type OctaneComponentProps<TComp> = TComp extends 'a'
  ? OctaneAnchorProps
  : TComp extends ComponentBody<infer TProps, infer _TExtra>
    ? TProps
    : Record<string, unknown>

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  OctaneAnchorProps

export type ActiveLinkOptions<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  ActiveLinkOptionProps<TComp>

type ActiveLinkProps<TComp> = Partial<
  OctaneComponentProps<TComp> & {
    [key: `data-${string}`]: unknown
  }
>

export interface ActiveLinkOptionProps<TComp = 'a'> {
  activeProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
  inactiveProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
}

export type LinkProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkPropsChildren

export interface LinkPropsChildren {
  children?:
    | OctaneRenderable
    | ((state: { isActive: boolean; isTransitioning: boolean }) => unknown)
}

export type CreateLinkProps = LinkProps<
  unknown,
  AnyRouter,
  string,
  string,
  string,
  string
>

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = Omit<OctaneComponentProps<TComp>, keyof CreateLinkProps> &
  LinkProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type LinkComponent<
  in out TComp,
  in out TDefaultFrom extends string = string,
> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = TDefaultFrom,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => void

export interface LinkComponentRoute<
  in out TDefaultFrom extends string = string,
> {
  defaultFrom: TDefaultFrom;
  <
    TRouter extends AnyRouter = RegisteredRouter,
    const TTo extends string | undefined = undefined,
    const TMaskTo extends string = '',
  >(
    props: LinkComponentProps<
      'a',
      TRouter,
      this['defaultFrom'],
      TTo,
      this['defaultFrom'],
      TMaskTo
    >,
  ): void
}
