import { AnyRoute } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { RouteMatch } from './Matches'
import { useMatch } from './Matches'
import { useRouter } from './RouterProvider'
import React from 'react'

export function useSetSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TSearch extends Record<string, any> = RouteById<
    TRouteTree,
    TFrom
  >['types']['fullSearchSchema'],
>(opts: {
  from: TFrom
  replace: boolean | undefined
}): (search: Partial<TSearch>) => void {
  const router = useRouter()

  const pathname = useMatch({
    from: opts.from,
    select: (match: RouteMatch) => {
      return match.pathname
    },
  })

  return React.useCallback((search: Partial<TSearch>) => {
    const __tempSearch = { ...router.state.location.search, ...search }
    const { hash, state } = router.state.location
    const searchStr = router.options.stringifySearch(__tempSearch)

    router.commitLocation({
      replace: opts.replace ?? true,
      pathname,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      search: __tempSearch,
      searchStr,
      state,
    })
  }, [])
}
