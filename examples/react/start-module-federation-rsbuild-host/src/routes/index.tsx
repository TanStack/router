import { createFileRoute } from '@tanstack/react-router'

const shouldLoadFederatedMessage =
  typeof window !== 'undefined' || process.env.HOST_MODE === 'ssr'

const FederatedMessage = shouldLoadFederatedMessage
  ? (await import('mf_remote/message')).FederatedMessage
  : function FederatedMessagePlaceholder() {
      return <p>Federated message renders on the client in this mode.</p>
    }

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h1>Host application</h1>
      <p>This page renders a module exposed by the remote application.</p>
      <ul>
        <li>
          <a href="/dynamic-remote">Dynamic remote route registration</a>
        </li>
        <li>
          <a href="/selective-client-only">Selective SSR remote route</a>
        </li>
        <li>
          <a href="/server-fn-mf">Server function federation route</a>
        </li>
      </ul>
      <FederatedMessage />
    </main>
  )
}
