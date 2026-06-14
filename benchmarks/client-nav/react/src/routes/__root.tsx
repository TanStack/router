import {
  Link,
  Outlet,
  createRootRoute,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import {
  linkGroups,
  rootSelectors,
  runPerfSelectorComputation,
} from '../shared'
import { Route as SearchRoute } from './search'

export const Route = createRootRoute({
  component: Root,
})

function RootParamsSubscriber() {
  const params = useParams({
    strict: false,
    select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
  })

  void runPerfSelectorComputation(params)
  return null
}

function RootSearchSubscriber() {
  const search = useSearch({
    strict: false,
    select: (search) => runPerfSelectorComputation(Number(search.page ?? 0)),
  })

  void runPerfSelectorComputation(search)
  return null
}

function LinkPanel() {
  return (
    <>
      {linkGroups.map((groupIndex) => {
        const itemsId = groupIndex === 0 ? 1 : groupIndex + 2
        const ctxId = groupIndex + 1

        return (
          <div key={groupIndex}>
            <Link
              data-testid={groupIndex === 0 ? 'go-items-1' : undefined}
              to="/items/$id"
              params={{ id: itemsId }}
              replace
              activeOptions={{ exact: true }}
              activeProps={{ className: 'active-link' }}
              inactiveProps={{ className: 'inactive-link' }}
            >
              {`Items ${itemsId}`}
            </Link>
            <Link
              data-testid={groupIndex === 0 ? 'go-items-2' : undefined}
              to="/items/$id"
              params={{ id: 2 }}
              replace
              activeOptions={{ includeSearch: false }}
            >
              {`Items 2 alt ${groupIndex}`}
            </Link>
            <Link
              data-testid={groupIndex === 0 ? 'go-search' : undefined}
              to="/search"
              search={
                { page: 1, filter: 'all', junk: `group-${groupIndex}` } as any
              }
              replace
              activeOptions={{ includeSearch: true }}
              activeProps={{ className: 'active-link' }}
              inactiveProps={{ className: 'inactive-link' }}
            >
              {`Search ${groupIndex}`}
            </Link>
            <Link
              data-testid={groupIndex === 0 ? 'go-ctx' : undefined}
              to="/ctx/$id"
              params={{ id: ctxId } as any}
              search={true}
              replace
              activeOptions={{ includeSearch: false }}
            >
              {`Context ${ctxId}`}
            </Link>
            <Link
              from={SearchRoute.fullPath}
              to="/search"
              search={(prev: { page: number; filter: string }) => ({
                page: prev.page + groupIndex + 1,
                filter: prev.filter,
                junk: `updater-${groupIndex}`,
              })}
              activeOptions={{ includeSearch: true }}
            >
              {({ isActive }) =>
                isActive
                  ? `Search updater active ${groupIndex}`
                  : `Search updater inactive ${groupIndex}`
              }
            </Link>
          </div>
        )
      })}
    </>
  )
}

function Root() {
  return (
    <>
      {rootSelectors.map((selector) => (
        <RootParamsSubscriber key={`root-params-${selector}`} />
      ))}
      {rootSelectors.map((selector) => (
        <RootSearchSubscriber key={`root-search-${selector}`} />
      ))}
      <LinkPanel />
      <Outlet />
    </>
  )
}
