import { For } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { routeSelectors } from '../shared'
import { ItemParamsSubscriber } from './items.$id'

export const Route = createFileRoute('/items/$id/details')({
  component: ItemDetailsPage,
})

function ItemDetailsPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <ItemParamsSubscriber />}</For>
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
