import { queryOptions, useQuery } from '@tanstack/vue-query'
import { createFileRoute } from '@tanstack/vue-router'
import { Suspense, defineComponent } from 'vue'
import type { PropType } from 'vue'

type QueryType = 'sync' | 'fast-async' | 'slow-async'

type QueryData = {
  type: QueryType
  id: number
  value: string
  source: string
}

function makeQueryOptions(
  type: QueryType,
  id: number,
  value: string,
  delayMs = 0,
) {
  return queryOptions({
    queryKey: ['streaming-ssr-query-heavy', type, id],
    queryFn: async (): Promise<QueryData> => {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }

      return {
        type,
        id,
        value,
        source: typeof window === 'undefined' ? 'server' : 'client',
      }
    },
    staleTime: Infinity,
  })
}

const syncQuery1 = makeQueryOptions('sync', 1, 'sync-value-1')
const syncQuery2 = makeQueryOptions('sync', 2, 'sync-value-2')
const syncQuery3 = makeQueryOptions('sync', 3, 'sync-value-3')
const fastAsyncQuery1 = makeQueryOptions('fast-async', 1, 'fast-async-1', 50)
const fastAsyncQuery2 = makeQueryOptions('fast-async', 2, 'fast-async-2', 75)
const fastAsyncQuery3 = makeQueryOptions('fast-async', 3, 'fast-async-3', 100)
const slowAsyncQuery1 = makeQueryOptions('slow-async', 1, 'slow-async-1', 200)
const slowAsyncQuery2 = makeQueryOptions('slow-async', 2, 'slow-async-2', 300)
const slowAsyncQuery3 = makeQueryOptions('slow-async', 3, 'slow-async-3', 400)

type QueryOptions = ReturnType<typeof makeQueryOptions>

const QueryDisplay = defineComponent({
  props: {
    queryOpts: {
      type: Object as PropType<QueryOptions>,
      required: true,
    },
    testId: {
      type: String,
      required: true,
    },
  },
  async setup(props) {
    const query = useQuery(props.queryOpts)
    await query.suspense()

    return () => {
      const data = query.data.value

      return (
        <div data-testid={props.testId}>
          {data?.value} (source: {data?.source})
        </div>
      )
    }
  },
})

function QuerySuspense(props: {
  queryOpts: QueryOptions
  testId: string
  fallback: string
}) {
  return (
    <Suspense>
      {{
        default: () => (
          <QueryDisplay queryOpts={props.queryOpts} testId={props.testId} />
        ),
        fallback: () => (
          <div data-testid={`${props.testId}-loading`}>{props.fallback}</div>
        ),
      }}
    </Suspense>
  )
}

const QueryHeavy = defineComponent({
  setup() {
    return () => (
      <div style={{ padding: '20px' }}>
        <h2>Query Heavy Test (9 useSuspenseQuery calls)</h2>
        <p>Tests multiple useSuspenseQuery with mixed sync/async queryFn.</p>
        <p>
          All queries should show "source: server" if SSR streaming works
          correctly.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '20px',
            marginTop: '20px',
          }}
        >
          <div>
            <h3>Sync Queries (immediate)</h3>
            <QuerySuspense
              queryOpts={syncQuery1}
              testId="sync-query-1"
              fallback="Loading sync 1..."
            />
            <QuerySuspense
              queryOpts={syncQuery2}
              testId="sync-query-2"
              fallback="Loading sync 2..."
            />
            <QuerySuspense
              queryOpts={syncQuery3}
              testId="sync-query-3"
              fallback="Loading sync 3..."
            />
          </div>

          <div>
            <h3>Fast Async Queries (50-100ms)</h3>
            <QuerySuspense
              queryOpts={fastAsyncQuery1}
              testId="fast-async-query-1"
              fallback="Loading fast 1..."
            />
            <QuerySuspense
              queryOpts={fastAsyncQuery2}
              testId="fast-async-query-2"
              fallback="Loading fast 2..."
            />
            <QuerySuspense
              queryOpts={fastAsyncQuery3}
              testId="fast-async-query-3"
              fallback="Loading fast 3..."
            />
          </div>

          <div>
            <h3>Slow Async Queries (200-400ms)</h3>
            <QuerySuspense
              queryOpts={slowAsyncQuery1}
              testId="slow-async-query-1"
              fallback="Loading slow 1..."
            />
            <QuerySuspense
              queryOpts={slowAsyncQuery2}
              testId="slow-async-query-2"
              fallback="Loading slow 2..."
            />
            <QuerySuspense
              queryOpts={slowAsyncQuery3}
              testId="slow-async-query-3"
              fallback="Loading slow 3..."
            />
          </div>
        </div>
      </div>
    )
  },
})

export const Route = createFileRoute('/query-heavy')({
  component: QueryHeavy,
})
