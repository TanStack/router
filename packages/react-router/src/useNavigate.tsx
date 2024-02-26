import * as React from 'react'
import { useMatch } from './Matches'
import { useRouter } from './useRouter'
import { LinkOptions, NavigateOptions } from './link'
import { AnyRoute } from './route'
import { RoutePaths, RoutePathsAutoComplete } from './routeInfo'
import { RegisteredRouter } from './router'

export type UseNavigateResult<TDefaultFrom extends string> = <
  TTo extends string,
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = TDefaultFrom,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>({
  from,
  ...rest
}: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>) => Promise<void>

export function useNavigate<
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: RoutePathsAutoComplete<RegisteredRouter['routeTree'], TDefaultFrom>
}) {
  const { navigate } = useRouter()

  const matchPathname = useMatch({
    strict: false,
    select: (s) => s.pathname,
  })

  const result: UseNavigateResult<TDefaultFrom> = ({ from, ...rest }) => {
    return navigate({
      from: rest?.to ? matchPathname : undefined,
      ...(rest as any),
    })
  }

  return React.useCallback(result, [])
}

// NOTE: I don't know of anyone using this. It's undocumented, so let's wait until someone needs it
// export function typedNavigate<
//   TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
//   TDefaultFrom extends RoutePaths<TRouteTree> = '/',
// >(navigate: (opts: NavigateOptions<any>) => Promise<void>) {
//   return navigate as <
//     TFrom extends RoutePaths<TRouteTree> = TDefaultFrom,
//     TTo extends string = '',
//     TMaskFrom extends RoutePaths<TRouteTree> = '/',
//     TMaskTo extends string = '',
//   >(
//     opts?: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
//   ) => Promise<void>
// } //

export function Navigate<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(props: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const { navigate } = useRouter()
  const match = useMatch({ strict: false })

  React.useEffect(() => {
    navigate({
      from: props.to ? match.pathname : undefined,
      ...props,
    } as any)
  }, [])

  return null
}

export type UseLinkPropsOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ActiveLinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>

export type LinkProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ActiveLinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }

export type ActiveLinkOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = LinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
}
