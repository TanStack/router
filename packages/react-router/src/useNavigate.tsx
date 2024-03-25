import * as React from 'react'
import { useMatch } from './Matches'
import { useRouter } from './useRouter'

import type { NavigateOptions } from './link'
import type { AnyRoute } from './route'
import type { RoutePaths, RoutePathsAutoComplete } from './routeInfo'
import type { RegisteredRouter } from './router'

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
}): UseNavigateResult<TDefaultFrom> {
  const router = useRouter()

  return React.useCallback(
    (options: NavigateOptions) => {
      return router.navigate({
        ...options,
        from: options.to ? router.state.resolvedLocation.pathname : undefined,
      })
    },
    [router],
  )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
