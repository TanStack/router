import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { serverFnCallingMiddleware } from '~/middleware/serverFnCallingMiddleware'

/**
 * Regression test for https://github.com/TanStack/router/issues/7213.
 *
 * A middleware defined in a separate file (`serverFnCallingMiddleware`) calls a
 * server function defined in yet another separate file
 * (`serverFnCalledByMiddleware`). That middleware is then applied to the server
 * function below.
 *
 * In production builds this used to fail at runtime with
 * "Server function info not found for [ID]" because the server function that is
 * only reachable through the middleware was never registered in the server
 * function manifest. It worked in development and when everything lived in a
 * single file.
 */
const serverFnWithMiddleware = createServerFn()
  .middleware([serverFnCallingMiddleware])
  .handler(async ({ context }) => {
    return { fromMiddleware: context.fromMiddleware }
  })

export const Route = createFileRoute('/middleware/serverfn-in-middleware')({
  component: RouteComponent,
})

function RouteComponent() {
  const [result, setResult] = React.useState<{
    fromMiddleware: { message: string; secret: number }
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleClick() {
    try {
      const data = await serverFnWithMiddleware()
      setResult(data)
      setError(null)
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="p-2 m-2 grid gap-2">
      <h2>Server Function Called From Middleware (issue #7213)</h2>
      <p>
        A middleware in a separate file calls a server function in another
        separate file, and that middleware is applied to this server function.
      </p>
      <button
        onClick={handleClick}
        data-testid="test-serverfn-in-middleware-btn"
      >
        Call server function with middleware
      </button>
      {result && (
        <pre data-testid="serverfn-in-middleware-result">
          {JSON.stringify(result)}
        </pre>
      )}
      {error && (
        <div data-testid="serverfn-in-middleware-error">Error: {error}</div>
      )}
    </div>
  )
}
