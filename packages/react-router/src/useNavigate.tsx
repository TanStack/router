import * as React from 'react'
import { useRouter } from './useRouter'
import type { FromPathOption, NavigateOptions } from './link'
import type { RoutePaths } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'

export type UseNavigateResult<TDefaultFrom extends string> = <
  TRouter extends RegisteredRouter,
  TTo extends string | undefined,
  TFrom extends string = TDefaultFrom,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>({
  from,
  ...rest
}: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>) => Promise<void>

export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const { navigate } = useRouter()

  return React.useCallback(
    (options: NavigateOptions) => {
      return navigate({
        ...options,
      })
    },
    [navigate],
  ) as UseNavigateResult<TDefaultFrom>
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
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const { navigate } = useRouter()

  React.useEffect(() => {
    navigate({
      ...props,
    } as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
