import { Link, createFileRoute } from '@tanstack/react-router'
import { routeSelectors } from '../shared'
import { ItemParamsSubscriber } from './items.$id'

export const Route = createFileRoute('/items/$id/details')({
  component: ItemDetailsPage,
})

function ItemDetailsPage() {
  return (
    <>
      {routeSelectors.map((selector) => (
        <ItemParamsSubscriber key={`detail-params-${selector}`} />
      ))}
      <Link
        data-testid="items-parent"
        from={Route.fullPath}
        to=".."
        replace
        activeOptions={{ exact: true }}
      >
        Back to item
      </Link>
    </>
  )
}
