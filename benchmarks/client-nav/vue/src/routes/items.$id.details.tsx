import * as Vue from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'
import { routeSelectors } from '../shared'
import { ItemParamsSubscriber } from './items.$id'

const ItemDetailsPage = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})

export const Route = createFileRoute('/items/$id/details')({
  component: ItemDetailsPage,
})
