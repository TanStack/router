/**
 * Client stub for renderToReadableStream.
 *
 * This function should never be called at runtime on the client.
 * It exists only to provide types for bundler imports in client bundles.
 * The real implementation only runs inside RSC context (server functions).
 */
export function renderToReadableStream(
  _node: React.ReactNode,
): ReadableStream<Uint8Array> {
  throw new Error(
    process.env.NODE_ENV !== 'production'
      ? "renderToReadableStream cannot be called on the client. Call it inside a server function's `.handler()`, and call that server function where you need the result (e.g. in the route's loader)."
      : 'renderToReadableStream cannot be called on the client',
  )
}
