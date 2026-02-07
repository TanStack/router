import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { sortJson } from '~/utils/sortJson'

const fetchTimestamp = createServerFn({ method: 'GET' }).handler(async () => {
  return {
    message: 'Hello from server!',
    timestamp: new Date().toISOString(),
  }
})

const timestampQueryOptions = () =>
  queryOptions({
    queryKey: ['timestamp'],
    queryFn: () => fetchTimestamp(),
  })

export const Route = createFileRoute('/query-test')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(timestampQueryOptions())
  },
  component: QueryTestComponent,
})

function QueryTestComponent() {
  const router = useRouter()
  const timestampQuery = useSuspenseQuery(timestampQueryOptions())

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-bold text-lg">Query Test</h1>

      <div>
        <div className="font-semibold">
          Router context (router.options.context)
        </div>
        <pre
          data-testid="router-context-query"
          className="bg-gray-100 p-2 rounded text-black"
        >
          {JSON.stringify(
            {
              context: sortJson(router.options.context),
            },
            null,
            2,
          )}
        </pre>
      </div>

      <div>
        <div className="font-semibold">Query data (from TanStack Query)</div>
        <pre
          data-testid="query-data"
          className="bg-gray-100 p-2 rounded text-black"
        >
          {JSON.stringify(timestampQuery.data, null, 2)}
        </pre>
      </div>

      <div>
        <div className="font-semibold">Query client available</div>
        <span data-testid="query-client-available">
          {router.options.context.queryClient ? 'true' : 'false'}
        </span>
      </div>
    </div>
  )
}
