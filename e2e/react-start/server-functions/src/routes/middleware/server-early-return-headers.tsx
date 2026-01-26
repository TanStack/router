import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

/**
 * Verifies that middleware can short-circuit with result({ headers }).
 *
 * The e2e assertion for the headers is done in Playwright by
 * inspecting the `_serverFn` response headers.
 */
const serverEarlyReturnHeadersMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ result }) => {
  return result({
    data: {
      source: 'middleware',
      message: 'Early return from server middleware with headers',
    },
    headers: {
      'x-middleware-early-return': 'true',
      'x-middleware-early-return-value': 'hello',
    },
  })
})

const serverFn = createServerFn()
  .middleware([serverEarlyReturnHeadersMiddleware])
  .handler(() => {
    return {
      source: 'handler',
      message: 'This should not be returned',
    }
  })

export const Route = createFileRoute('/middleware/server-early-return-headers')(
  {
    component: RouteComponent,
  },
)

function RouteComponent() {
  const [resultValue, setResultValue] = React.useState<any>(null)
  const [capturedResponseHeaders, setCapturedResponseHeaders] =
    React.useState<Record<string, string> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  return (
    <div className="p-4" data-testid="server-early-return-headers-route">
      <h2 className="font-bold text-lg mb-4">
        Server Middleware Early Return with Headers
      </h2>
      <p className="mb-4">
        Calls a server function that short-circuits in middleware via result()
        and sets response headers.
      </p>

      <button
        data-testid="invoke-btn"
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
        onClick={async () => {
          setError(null)
          setResultValue(null)
          setCapturedResponseHeaders(null)

          try {
            const captureHeadersFetch : typeof fetch = async (
              url,
              init
            ) => {
              const response = await fetch(url, init)
              setCapturedResponseHeaders(
                Object.fromEntries(response.headers.entries()),
              )
              return response
            }

            const res = await serverFn({
              headers: {
                'x-test-request': 'ok',
              },
              fetch: captureHeadersFetch,
            })

            setResultValue(res)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }}
      >
        Call Server Function
      </button>

      <div className="grid gap-2">
        <div>
          <h3 className="font-semibold">Result Data:</h3>
          <pre data-testid="result-data" className="text-xs">
            {resultValue
              ? JSON.stringify(resultValue, null, 2)
              : 'Not called yet'}
          </pre>
        </div>

        <div>
          <h3 className="font-semibold">Captured Response Headers:</h3>
          <pre data-testid="captured-response-headers" className="text-xs">
            {capturedResponseHeaders
              ? JSON.stringify(capturedResponseHeaders, null, 2)
              : 'Not captured yet'}
          </pre>
        </div>

        {error ? (
          <div data-testid="error">{error}</div>
        ) : (
          <div data-testid="error" style={{ display: 'none' }} />
        )}
      </div>
    </div>
  )
}
