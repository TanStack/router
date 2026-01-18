import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

/**
 * This middleware's .server() conditionally calls next() OR returns a value.
 * If `shouldShortCircuit` is true in the data, it returns early.
 * Otherwise, it calls next() and passes context to the handler.
 */
const serverConditionalMiddleware = createMiddleware({
  type: 'function',
})
  .inputValidator(
    (input: { shouldShortCircuit: boolean; value: string }) => input,
  )
  .server(async ({ data, next }) => {
    if (data.shouldShortCircuit) {
      return {
        source: 'middleware',
        message: 'Conditional early return from server middleware',
        condition: 'shouldShortCircuit=true',
      }
    }
    return next({
      context: {
        passedThroughMiddleware: true,
      },
    })
  })

const serverFn = createServerFn()
  .middleware([serverConditionalMiddleware])
  .handler(({ data, context }) => {
    return {
      source: 'handler',
      message: 'Handler was called',
      receivedData: data,
      receivedContext: context,
    }
  })

export const Route = createFileRoute('/middleware/server-conditional')({
  loader: async () => {
    // Test both branches in the loader
    const shortCircuitResult = await serverFn({
      data: { shouldShortCircuit: true, value: 'loader-short' },
    })
    const nextResult = await serverFn({
      data: { shouldShortCircuit: false, value: 'loader-next' },
    })
    return { shortCircuitResult, nextResult }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { shortCircuitResult, nextResult } = Route.useLoaderData()
  const [clientShortCircuit, setClientShortCircuit] = React.useState<any>(null)
  const [clientNext, setClientNext] = React.useState<any>(null)

  const expectedShortCircuit = {
    source: 'middleware',
    message: 'Conditional early return from server middleware',
    condition: 'shouldShortCircuit=true',
  }

  const expectedNext = {
    source: 'handler',
    message: 'Handler was called',
    receivedData: { shouldShortCircuit: false, value: 'client-next' },
    receivedContext: { passedThroughMiddleware: true },
  }

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-4">
        Server Middleware Conditional Return
      </h2>
      <p className="mb-4">
        Tests that a .server() middleware can conditionally call next() OR
        return a value based on input data.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="border p-4 rounded">
          <h3 className="font-semibold mb-2">Short-Circuit Branch</h3>

          <div className="mb-2">
            <h4>Expected (client):</h4>
            <pre
              data-testid="expected-short-circuit"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {JSON.stringify(expectedShortCircuit)}
            </pre>
          </div>

          <div className="mb-2">
            <h4>Loader Result:</h4>
            <pre
              data-testid="loader-short-circuit"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {JSON.stringify(shortCircuitResult)}
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
          <h3 className="font-semibold mb-2">Next() Branch</h3>

          <div className="mb-2">
            <h4>Expected (client):</h4>
            <pre
              data-testid="expected-next"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {JSON.stringify(expectedNext)}
            </pre>
          </div>

          <div className="mb-2">
            <h4>Loader Result:</h4>
            <pre
              data-testid="loader-next"
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded text-xs"
            >
              {JSON.stringify(nextResult)}
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
    </div>
  )
}
