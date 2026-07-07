import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { sharedServerFn } from '@tanstack/react-start-e2e-shared-server-fns'

/**
 * Regression test for https://github.com/TanStack/router/issues/7213 covering
 * server functions defined in a SEPARATE package.
 *
 * `sharedServerFn` is exported by a workspace package and called from the client
 * here. Its handler calls `sharedInnerServerFn`, which lives in that same package
 * and is only reachable through the handler — i.e. a server-only function defined
 * outside the app root, behind a handler boundary. In production this used to
 * fail at runtime with "Server function info not found" because the inner
 * function was never registered in the manifest.
 */
export const Route = createFileRoute('/shared-package-server-fn')({
  component: RouteComponent,
})

function RouteComponent() {
  const [result, setResult] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleClick() {
    try {
      setResult(JSON.stringify(await sharedServerFn()))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    }
  }

  return (
    <div className="p-2 m-2 grid gap-2">
      <h2>Server Function From a Separate Package (issue #7213)</h2>
      <button onClick={handleClick} data-testid="test-shared-package-btn">
        Call shared-package server function
      </button>
      {result && <pre data-testid="shared-package-result">{result}</pre>}
      {error && <div data-testid="shared-package-error">Error: {error}</div>}
    </div>
  )
}
