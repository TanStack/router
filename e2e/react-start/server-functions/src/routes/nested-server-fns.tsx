import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { chainLevelB } from '~/functions/chainLevelB'

/**
 * Regression test for https://github.com/TanStack/router/issues/7213 exercising
 * a multi-level cross-file chain:
 *
 *   chainLevelA (client-called) -> chainLevelB (handler) -> chainLevelC (handler)
 *
 * Each function lives in its own file; levelB and levelC are server-only. levelC
 * is only reachable through levelB's handler, so it is discovered only after
 * levelB is registered and its provider module is crawled — i.e. the discovery
 * fixpoint must iterate more than once for this to end up in the manifest.
 */
const chainLevelA = createServerFn().handler(async () => {
  return chainLevelB()
})

export const Route = createFileRoute('/nested-server-fns')({
  component: RouteComponent,
})

function RouteComponent() {
  const [result, setResult] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleClick() {
    try {
      setResult(JSON.stringify(await chainLevelA()))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    }
  }

  return (
    <div className="p-2 m-2 grid gap-2">
      <h2>Nested Cross-File Server Functions (issue #7213)</h2>
      <button onClick={handleClick} data-testid="test-nested-server-fns-btn">
        Call nested chain
      </button>
      {result && <pre data-testid="nested-server-fns-result">{result}</pre>}
      {error && <div data-testid="nested-server-fns-error">Error: {error}</div>}
    </div>
  )
}
