/**
 * Test: Module with createServerFn that internally uses server-only imports
 *
 * This module demonstrates the following pattern:
 *
 * 1. Exports isomorphic server functions (createServerFn) that are safe to
 *    import on the client - the compiler transforms them to fetch calls
 *
 * 2. Internally uses `import { getRequest } from '@tanstack/react-start/server'`
 *    which is a server-only API
 *
 * 3. The server-only import is used inside the createServerFn handler, which
 *    only runs on the server
 *
 * When a route imports only the isomorphic exports from this module, the
 * split-exports plugin should rewrite the import to eliminate the server-only
 * `getRequest` import from the client bundle through dead code elimination.
 */

import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

// ============================================================
// SERVER-ONLY CODE - Uses getRequest which is server-only
// This should NOT be bundled into the client
// ============================================================

/**
 * Internal server-only function that extracts info from the current request.
 * This uses `getRequest()` from @tanstack/react-start/server which is
 * server-only and would throw if called on the client.
 */
function getRequestInfo() {
  const request = getRequest()
  return {
    method: request.method,
    url: request.url,
    // Extract just the pathname for easier testing
    pathname: new URL(request.url).pathname,
  }
}

/**
 * Another server-only function that would break if bundled to client.
 * This is exported to verify it gets eliminated from client bundles.
 */
export function getServerOnlyRequestHeaders() {
  const request = getRequest()
  return Object.fromEntries(request.headers.entries())
}

/**
 * Server-only constant that should not leak to client.
 */
export const SERVER_REQUEST_MARKER =
  'This string should not appear in client bundles'

// ============================================================
// ISOMORPHIC CODE - Server Functions (createServerFn)
// These are safe to import on client - compiler transforms them
// ============================================================

/**
 * Server function that returns information about the current request.
 * This internally calls getRequestInfo() which uses the server-only
 * getRequest() API. The handler runs on the server, so this is safe.
 *
 * When called as a loader:
 * - method will be "GET"
 * - url will contain the server function endpoint
 *
 * When called as a mutation/action:
 * - method will be "POST"
 */
export const getRequestInfoServerFn = createServerFn().handler(() => {
  const info = getRequestInfo()
  return {
    method: info.method,
    pathname: info.pathname,
    // Include a marker to verify this ran on the server
    executedOn: 'server',
  }
})

/**
 * Server function that echoes back data along with request info.
 * Tests that server functions with input validators work correctly.
 */
export const echoWithRequestInfo = createServerFn()
  .inputValidator((data: { message: string }) => data)
  .handler(({ data }) => {
    const info = getRequestInfo()
    return {
      echo: data.message,
      method: info.method,
      executedOn: 'server',
    }
  })
