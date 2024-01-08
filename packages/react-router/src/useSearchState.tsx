import { AnyRoute } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { useStableCallback } from './utils'
import { useSearch } from './useSearch'
import { useNavigate } from './useNavigate'

export function useSearchState<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TSearch extends AnyRoute = RouteById<
    TRouteTree,
    TFrom
  >['types']['fullSearchSchema'],
  TSearchKey extends keyof TSearch = keyof TSearch,
>(opts: {
  from: TFrom
  key: TSearchKey
  navigate?: 'push' | 'replace'
}): [TSearch[TSearchKey], (value: TSearch[TSearchKey]) => void] {
  const value = useSearch({
    from: opts.from,
    select: (search) => search[opts.key],
  })

  const navigate = useNavigate()

  const setValue = useStableCallback((value: TSearch[TSearchKey]) => {
    navigate({
      search(current: object) {
        return {
          ...current,
          [opts.key]: value,
        }
      },
      replace: opts.navigate ? opts.navigate === 'replace' : true,
    })
  })

  return [value, setValue]
}
