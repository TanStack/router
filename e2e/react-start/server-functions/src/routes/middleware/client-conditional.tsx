import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

/**
 * This middleware's .client() conditionally calls next() OR returns a value.
 * If `shouldShortCircuit` is true in the data, it returns early on the client.
 * Otherwise, it calls next() which proceeds to the server.
 */
const clientConditionalMiddleware = createMiddleware({
  type: 'function',
})
  .inputValidator(
    (input: { shouldShortCircuit: boolean; value: string }) => input,
  )
  .client(
    // @ts-expect-error - types don't support union of next() result and arbitrary value
    async ({ data, next }) => {
      if (data.shouldShortCircuit) {
        return {
          source: 'client-middleware',
          message: 'Conditional early return from client middleware',
          condition: 'shouldShortCircuit=true',
          timestamp: Date.now(),
        }
      }
      // Proceed to server
      return next({
        sendContext: {
          clientTimestamp: Date.now(),
        },
      })
    },
  )

const serverFn = createServerFn()
  .middleware([clientConditionalMiddleware])
  .handler(({ data, context }) => {
    return {
      source: 'handler',
      message: 'Handler was called on server',
      receivedData: data,
      receivedContext: context,
    }
  })

export const Route = createFileRoute('/middleware/client-conditional')({
  loader: async () => {
    // In loader (server-side), client middleware may not apply the same way
    const result = await serverFn({
      data: { shouldShortCircuit: false, value: 'loader-value' },
    })
    return { loaderResult: result }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { loaderResult } = Route.useLoaderData()
  const [clientShortCircuit, setClientShortCircuit] = React.useState<any>(null)
  const [clientNext, setClientNext] = React.useState<any>(null)

  const expectedShortCircuit = {
    source: 'client-middleware',
    message: 'Conditional early return from client middleware',
    condition: 'shouldShortCircuit=true',
  }

  const expectedNext = {
    source: 'handler',
    message: 'Handler was called on server',
  }

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-4">
        Client Middleware Conditional Return
      </h2>
      <p className="mb-4">
        Tests that a .client() middleware can conditionally call next() OR
        return a value based on input data. Short-circuit avoids network
        request.
      </p>

      <div className="mb-4">
        <h3 className="font-semibold">Loader Result (SSR):</h3>
        <pre
          data-testid="loader-result"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
        >
          {JSON.stringify(loaderResult)}
        </pre>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border p-4 rounded">
          <h3 className="font-semibold mb-2">
            Short-Circuit Branch (Client-only)
          </h3>

          <div className="mb-2">
            <h4>Expected (partial):</h4>
            <pre
              data-testid="expected-short-circuit"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {JSON.stringify(expectedShortCircuit)}
            </pre>
          </div>

          <button
            data-testid="invoke-short-circuit-btn"
            className="bg-red-500 text-white px-4 py-2 rounded mb-2 w-full"
            onClick={async () => {
              const result = await serverFn({
                data: { shouldShortCircuit: true, value: 'client-short' },
              })
              setClientShortCircuit(result)
            }}
          >
            Call with Short-Circuit
          </button>

          <div>
            <h4>Client Result:</h4>
            <pre
              data-testid="client-short-circuit"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {clientShortCircuit
                ? JSON.stringify(clientShortCircuit)
                : 'Not called yet'}
            </pre>
          </div>
        </div>

        <div className="border p-4 rounded">
          <h3 className="font-semibold mb-2">Next() Branch (Goes to Server)</h3>

          <div className="mb-2">
            <h4>Expected (partial):</h4>
            <pre
              data-testid="expected-next"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {JSON.stringify(expectedNext)}
            </pre>
          </div>

          <button
            data-testid="invoke-next-btn"
            className="bg-green-500 text-white px-4 py-2 rounded mb-2 w-full"
            onClick={async () => {
              const result = await serverFn({
                data: { shouldShortCircuit: false, value: 'client-next' },
              })
              setClientNext(result)
            }}
          >
            Call with Next()
          </button>

          <div>
            <h4>Client Result:</h4>
            <pre
              data-testid="client-next"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {clientNext ? JSON.stringify(clientNext) : 'Not called yet'}
            </pre>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded">
        <h4 className="font-semibold">Note:</h4>
        <p className="text-sm">
          Short-circuit branch should NOT make a network request. Next() branch
          should make a network request to the server.
        </p>
      </div>
    </div>
  )
}
