import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import {
  noop,
  normalizePage,
  routeSelectors,
  runPerfSelectorComputation,
} from '../shared'

export const Route = createFileRoute('/items/$id')({
  params: {
    parse: (params) => ({
      ...params,
      id: normalizePage(params.id),
    }),
    stringify: (params) => ({
      ...params,
      id: `${params.id}`,
    }),
  },
  onEnter: noop,
  onStay: noop,
  onLeave: noop,
  component: ItemsPage,
})

export function ItemParamsSubscriber() {
  const params = Route.useParams({
    select: (params) => runPerfSelectorComputation(params.id),
  })

  void runPerfSelectorComputation(params)
  return null
}

function ItemsPage() {
  return (
    <>
      {routeSelectors.map((selector) => (
        <ItemParamsSubscriber key={`item-params-${selector}`} />
      ))}
      <Link
        data-testid="items-details"
        from={Route.fullPath}
        to="./details"
        replace
      >
        Details
      </Link>
      <Link
        from={Route.fullPath}
        to="."
        search={true}
        activeOptions={{ includeSearch: true }}
      >
        Preserve search on item
      </Link>
      <Outlet />
    </>
  )
}
