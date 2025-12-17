import { queryOptions, useQuery } from '@tanstack/vue-query'
import { Link, createFileRoute } from '@tanstack/vue-router'
import { Suspense, defineComponent } from 'vue'

const doubleQueryOptions = (n: number) =>
  queryOptions({
    queryKey: ['double', n],
    queryFn: async () => {
      // Add a delay to make the transition observable
      await new Promise((r) => setTimeout(r, 500))
      return n * 2
    },
    placeholderData: (previousData) => previousData,
  })

export const Route = createFileRoute('/suspense-transition')({
  validateSearch: (search: { n?: number }) => ({ n: search.n ?? 1 }),
  component: SuspenseTransitionComponent,
  ssr: false, // Disable SSR to avoid suspense issues during initial load
})

function SuspenseTransitionComponent() {
  return (
    <div class="p-2">
      <h1 data-testid="suspense-transition-title">Suspense Transition Test</h1>

      <div class="flex gap-2 my-4">
        <Link
          data-testid="increase-button"
          class="border bg-gray-50 px-3 py-1"
          from="/suspense-transition"
          search={(s) => ({ n: s.n + 1 })}
        >
          Increase
        </Link>
      </div>

      <Result />
    </div>
  )
}

const Result = defineComponent({
  setup() {
    const search = Route.useSearch()

    return () => (
      <div class="mt-2 border p-4">
        {/* This manual Suspense boundary should transition, not immediately show fallback */}
        <Suspense>
          {{
            default: () => (
              <SuspenseResult key={search.value.n} n={search.value.n} />
            ),
            fallback: () => (
              <div data-testid="suspense-fallback">Loading...</div>
            ),
          }}
        </Suspense>
      </div>
    )
  },
})

const SuspenseResult = defineComponent({
  props: {
    n: {
      type: Number,
      required: true,
    },
  },
  async setup(props) {
    const doubleQuery = useQuery(doubleQueryOptions(props.n))
    await doubleQuery.suspense()

    return () => (
      <div data-testid="suspense-content">
        <div>
          n: <span data-testid="n-value">{props.n}</span>
        </div>
        <div>
          double:{' '}
          <span data-testid="double-value">{doubleQuery.data.value}</span>
        </div>
      </div>
    )
  },
})
