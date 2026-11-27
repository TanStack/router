import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const ItemPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()
    return () => (
      <main>
        <p data-testid="page-state">{`item-${params.value.id}`}</p>
      </main>
    )
  },
})

export const Route = createFileRoute('/items/$id')({
  component: ItemPage,
})
