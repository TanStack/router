import { queryOptions } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { useStreamedQuery } from '../utils/useStreamedQuery'

const deferredQueryOptions = () =>
  queryOptions({
    queryKey: ['deferred'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 3000))
      return {
        message: `Hello deferred from ${
          typeof document !== 'undefined' ? 'client' : 'server'
        }`,
        status: 'success',
      }
    },
  })

export const Route = createFileRoute('/deferred')({
  loader: async ({ context }) => {
    // Kick off loading on the server and client
    context.queryClient.prefetchQuery(deferredQueryOptions())
  },
  component: Deferred,
})

function Deferred() {
  const [count, setCount] = useState(0)

  return (
    <div className="p-2">
      <Suspense fallback="Loading Middleman...">
        <DeferredQuery />
      </Suspense>
      <div>Count: {count}</div>
      <div>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
    </div>
  )
}

function DeferredQuery() {
  const deferredQuery = useStreamedQuery(deferredQueryOptions())

  return (
    <div>
      <h1>Deferred Query</h1>
      <div>Status: {deferredQuery.data.status}</div>
      <div>Message: {deferredQuery.data.message}</div>
    </div>
  )
}
