import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

/**
 * This middleware's .client() does NOT call next() at all
 * and always returns a value directly.
 *
 * Expected behavior: The server function should never be called on the server,
 * and the middleware's return value should be the result.
 *
 * Note: This means no network request to the server should happen.
 */
const clientEarlyReturnMiddleware = createMiddleware({
  type: 'function',
}).client(async () => {
  return {
    source: 'client-middleware',
    message: 'Early return from client middleware',
    timestamp: Date.now(),
  }
})

const serverFn = createServerFn()
  .middleware([clientEarlyReturnMiddleware])
  .handler(() => {
    // This handler should NEVER be called because client middleware returns early
    return {
      source: 'handler',
      message: 'This should not be returned - server was called!',
    }
  })

export const Route = createFileRoute('/middleware/client-early-return')({
  // Note: In SSR context, client middleware may behave differently
  // The loader runs on the server, so client middleware doesn't apply the same way
  loader: async () => {
    const result = await serverFn()
    return { loaderResult: result }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { loaderResult } = Route.useLoaderData()
  const [clientResult, setClientResult] = React.useState<any>(null)

  // When called from client, we expect the client middleware to short-circuit
  const expectedClientResult = {
    source: 'client-middleware',
    message: 'Early return from client middleware',
  }

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-4">
        Client Middleware Early Return (No next() call)
      </h2>
      <p className="mb-4">
        Tests that a .client() middleware can return a value without calling
        next(), effectively short-circuiting before the server is even called.
      </p>

      <div className="mb-4">
        <h3 className="font-semibold">
          Expected Client Result (partial match):
        </h3>
        <pre
          data-testid="expected-result"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {JSON.stringify(expectedClientResult)}
        </pre>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold">Loader Result (SSR - may differ):</h3>
        <pre
          data-testid="loader-result"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {JSON.stringify(loaderResult)}
        </pre>
      </div>

      <button
        data-testid="invoke-btn"
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
        onClick={async () => {
          const result = await serverFn()
          setClientResult(result)
        }}
      >
        Call Server Function (from client)
      </button>

      <div>
        <h3 className="font-semibold">Client Result:</h3>
        <pre
          data-testid="client-result"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {clientResult ? JSON.stringify(clientResult) : 'Not called yet'}
        </pre>
      </div>

      <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded">
        <h4 className="font-semibold">Note:</h4>
        <p className="text-sm">
          When called from client, the middleware should return immediately
          without making a network request to the server. The source should be
          "client-middleware".
        </p>
      </div>
    </div>
  )
}
