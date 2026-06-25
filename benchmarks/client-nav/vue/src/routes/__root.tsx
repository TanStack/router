import * as Vue from 'vue'
import {
  Link,
  Outlet,
  createRootRoute,
  useParams,
  useSearch,
} from '@tanstack/vue-router'
import {
  linkGroups,
  rootSelectors,
  runPerfSelectorComputation,
} from '../shared'
import { Route as SearchRoute } from './search'

const RootParamsSubscriber = Vue.defineComponent({
  setup() {
    const params = useParams({
      strict: false,
      select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
    })

    return () => {
      void runPerfSelectorComputation(params.value)
      return null
    }
  },
})

const RootSearchSubscriber = Vue.defineComponent({
  setup() {
    const search = useSearch({
      strict: false,
      select: (search) => runPerfSelectorComputation(Number(search.page ?? 0)),
    })

    return () => {
      void runPerfSelectorComputation(search.value)
      return null
    }
  },
})

const LinkPanel = Vue.defineComponent({
  setup() {
    return () => (
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
                activeProps={{ class: 'active-link' }}
                inactiveProps={{ class: 'inactive-link' }}
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
                activeProps={{ class: 'active-link' }}
                inactiveProps={{ class: 'inactive-link' }}
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
                {({ isActive }: { isActive: boolean }) =>
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
  },
})

const Root = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})

export const Route = createRootRoute({
  component: Root,
})
