/**
 * Test: Nested server-only imports through createServerFn
 *
 * This route tests the following chain:
 *
 * 1. This route imports `getRequestInfoServerFn` (a createServerFn) from
 *    '../utils/server-request'
 *
 * 2. Inside server-request.ts, the createServerFn handler calls an internal
 *    function `getRequestInfo()` which uses:
 *    `import { getRequest } from '@tanstack/react-start/server'`
 *
 * 3. `getRequest` is a server-only API that cannot run on the client
 *
 * The split-exports plugin must ensure that when this route only imports
 * the isomorphic `getRequestInfoServerFn`, the server-only `getRequest`
 * import (and any other server-only exports) are eliminated from the
 * client bundle through dead code elimination.
 *
 * This validates that import rewriting works correctly through multiple
 * levels of the module graph.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

// Import only the isomorphic server function - the server-only exports
// (getServerOnlyRequestHeaders, SERVER_REQUEST_MARKER) should be eliminated
import {
  getRequestInfoServerFn,
  echoWithRequestInfo,
} from '../utils/server-request'

export const Route = createFileRoute('/server-request-import')({
  component: ServerRequestImportTest,
  loader: async () => {
    // Call the server function as a loader
    // This should return method: "GET" because loaders use GET requests
    const requestInfo = await getRequestInfoServerFn()
    return { requestInfo }
  },
})

function ServerRequestImportTest() {
  const { requestInfo } = Route.useLoaderData()
  const [clientResults, setClientResults] = useState<{
    requestInfo?: { method: string; pathname: string; executedOn: string }
    echoResult?: { echo: string; method: string; executedOn: string }
  } | null>(null)

  async function handleClick() {
    // Call server functions from client
    // These will be POST requests since they're called from client-side code
    const [requestInfo, echoResult] = await Promise.all([
      getRequestInfoServerFn(),
      echoWithRequestInfo({ data: { message: 'Hello from client!' } }),
    ])
    setClientResults({ requestInfo, echoResult })
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Server Request Import Test</h1>
      <p className="mb-4">
        Testing that imports inside files with ?tss-split-exports query are
        properly rewritten. This verifies that server-only imports (like
        getRequest from @tanstack/react-start/server) are eliminated from client
        bundles.
      </p>

      <div className="mb-6 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">SSR/Loader Results:</h2>
        <div className="space-y-2">
          <div>
            <span className="font-medium">Request Method (should be GET):</span>
            <pre data-testid="loader-method" className="inline ml-2">
              {requestInfo.method}
            </pre>
          </div>
          <div>
            <span className="font-medium">Executed On:</span>
            <pre data-testid="loader-executed-on" className="inline ml-2">
              {requestInfo.executedOn}
            </pre>
          </div>
          <div>
            <span className="font-medium">Full Result:</span>
            <pre data-testid="loader-result" className="block mt-1">
              {JSON.stringify(requestInfo, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      <button
        onClick={handleClick}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
        data-testid="run-client-tests-btn"
      >
        Run Client Tests
      </button>

      {clientResults && (
        <div className="p-4 bg-green-50 rounded">
          <h2 className="text-lg font-semibold mb-2">Client Results:</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">getRequestInfoServerFn result:</h3>
              <div className="ml-4 space-y-1">
                <div>
                  <span>Method (should be GET):</span>
                  <pre data-testid="client-method" className="inline ml-2">
                    {clientResults.requestInfo?.method}
                  </pre>
                </div>
                <div>
                  <span>Executed On:</span>
                  <pre data-testid="client-executed-on" className="inline ml-2">
                    {clientResults.requestInfo?.executedOn}
                  </pre>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-medium">echoWithRequestInfo result:</h3>
              <div className="ml-4 space-y-1">
                <div>
                  <span>Echo:</span>
                  <pre data-testid="echo-result" className="inline ml-2">
                    {clientResults.echoResult?.echo}
                  </pre>
                </div>
                <div>
                  <span>Method:</span>
                  <pre data-testid="echo-method" className="inline ml-2">
                    {clientResults.echoResult?.method}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
