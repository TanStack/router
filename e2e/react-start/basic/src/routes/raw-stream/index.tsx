import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/raw-stream/')({
  component: RawStreamIndex,
})

function RawStreamIndex() {
  return (
    <div>
      <p>Select a test category above to begin testing.</p>
      <ul className="list-disc pl-6 mt-4 space-y-2">
        <li>
          <Link
            to="/raw-stream/client-call"
            className="text-blue-500 underline"
          >
            Client Calls
          </Link>{' '}
          - Test RawStream via direct server function calls (RPC)
        </li>
        <li>
          <Link to="/raw-stream/ssr-single" className="text-blue-500 underline">
            SSR Single
          </Link>{' '}
          - Test single RawStream from route loader (SSR)
        </li>
        <li>
          <Link
            to="/raw-stream/ssr-multiple"
            className="text-blue-500 underline"
          >
            SSR Multiple
          </Link>{' '}
          - Test multiple RawStreams from route loader (SSR)
        </li>
        <li>
          <Link to="/raw-stream/ssr-mixed" className="text-blue-500 underline">
            SSR Mixed
          </Link>{' '}
          - Test RawStream mixed with deferred data from loader (SSR)
        </li>
        <li>
          <Link
            to="/raw-stream/ssr-text-hint"
            className="text-blue-500 underline"
          >
            SSR Text Hint
          </Link>{' '}
          - Test RawStream with hint: 'text' from loader (SSR)
        </li>
        <li>
          <Link
            to="/raw-stream/ssr-binary-hint"
            className="text-blue-500 underline"
          >
            SSR Binary Hint
          </Link>{' '}
          - Test RawStream with hint: 'binary' from loader (SSR)
        </li>
      </ul>
    </div>
  )
}
