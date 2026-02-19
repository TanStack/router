import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

/**
 * This middleware's .server() does NOT call next() at all
 * and always returns a value directly.
 *
 * Expected behavior: The handler should never be called,
 * and the middleware's return value should be the result.
 */
const serverEarlyReturnMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ result }) => {
  return result({
    data: {
      source: 'middleware',
      message: 'Early return from server middleware',
    },
  })
})

const serverFn = createServerFn()
  .middleware([serverEarlyReturnMiddleware])
  .handler(() => {
    // This handler should NEVER be called because middleware returns early
    return {
      source: 'handler',
      message: 'This should not be returned',
    }
  })

/**
 * This middleware returns an object that contains a "method" property.
 * This tests that our early return detection uses a Symbol, not duck-typing.
 * If we were checking for 'method' in result, this would cause a false positive.
 */
const methodPropertyMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ result }) => {
  return result({
    data: {
      source: 'middleware',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      message: 'Early return with method property',
    },
  })
})

const serverFnWithMethodProperty = createServerFn()
  .middleware([methodPropertyMiddleware])
  .handler(() => {
    // This handler should NEVER be called because middleware returns early
    return {
      source: 'handler',
      message: 'This should not be returned',
    }
  })

export const Route = createFileRoute('/middleware/server-early-return')({
  loader: async () => {
    const result = await serverFn()
    const resultWithMethod = await serverFnWithMethodProperty()
    return { loaderResult: result, loaderResultWithMethod: resultWithMethod }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { loaderResult, loaderResultWithMethod } = Route.useLoaderData()
  const [clientResult, setClientResult] = React.useState<any>(null)
  const [clientResultWithMethod, setClientResultWithMethod] =
    React.useState<any>(null)

  const expectedResult = {
    source: 'middleware',
    message: 'Early return from server middleware',
  }

  const expectedResultWithMethod = {
    source: 'middleware',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    message: 'Early return with method property',
  }

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-4">
        Server Middleware Early Return (No next() call)
      </h2>
      <p className="mb-4">
        Tests that a .server() middleware can return a value without calling
        next(), effectively short-circuiting the middleware chain.
      </p>

      <div className="mb-4">
        <h3 className="font-semibold">Expected Result:</h3>
        <pre
          data-testid="expected-result"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {JSON.stringify(expectedResult)}
        </pre>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold">Loader Result (SSR):</h3>
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
          try {
            const result = await serverFn()
            setClientResult(result)
          } catch (error) {
            setClientResult({ error: String(error) })
          }
        }}
      >
        Call Server Function
      </button>

      <div className="mb-4">
        <h3 className="font-semibold">Client Result:</h3>
        <pre
          data-testid="client-result"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {clientResult ? JSON.stringify(clientResult) : 'Not called yet'}
        </pre>
      </div>

      <hr className="my-4" />

      <h3 className="font-bold text-md mb-2">
        Early Return with 'method' Property
      </h3>
      <p className="mb-2 text-sm">
        This tests that early return detection uses a Symbol, not duck-typing.
      </p>

      <div className="mb-4">
        <h3 className="font-semibold">Expected Result (with method):</h3>
        <pre
          data-testid="expected-result-method"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {JSON.stringify(expectedResultWithMethod)}
        </pre>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold">Loader Result with method (SSR):</h3>
        <pre
          data-testid="loader-result-method"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {JSON.stringify(loaderResultWithMethod)}
        </pre>
      </div>

      <button
        data-testid="invoke-btn-method"
        className="bg-green-500 text-white px-4 py-2 rounded mb-4"
        onClick={async () => {
          try {
            const result = await serverFnWithMethodProperty()
            setClientResultWithMethod(result)
          } catch (error) {
            setClientResultWithMethod({ error: String(error) })
          }
        }}
      >
        Call Server Function (with method property)
      </button>

      <div>
        <h3 className="font-semibold">Client Result (with method):</h3>
        <pre
          data-testid="client-result-method"
          className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 p-2 rounded"
        >
          {clientResultWithMethod
            ? JSON.stringify(clientResultWithMethod)
            : 'Not called yet'}
        </pre>
      </div>
    </div>
  )
}
