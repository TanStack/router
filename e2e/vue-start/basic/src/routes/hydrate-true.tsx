import { createFileRoute } from '@tanstack/vue-router'
import { defineComponent, ref } from 'vue'

export const Route = createFileRoute('/hydrate-true')({
  loader: () => ({
    message: 'hydrate true route rendered',
  }),
  component: defineComponent({
    setup() {
      const data = Route.useLoaderData()
      const count = ref(0)

      return () => (
        <main>
          <h1 data-testid="hydrate-true-heading">Hydrate true route</h1>
          <p data-testid="hydrate-true-message">{data.value.message}</p>
          <p data-testid="hydrate-true-count">{count.value}</p>
          <button
            data-testid="hydrate-true-increment"
            onClick={() => count.value++}
          >
            Increment
          </button>
        </main>
      )
    },
  }),
})
