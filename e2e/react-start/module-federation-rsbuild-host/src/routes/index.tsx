import { createFileRoute } from '@tanstack/react-router'
import { FederatedMessage } from 'mf_remote/message'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h1 data-testid="host-heading">Host application</h1>
      <p data-testid="host-description">
        This page renders a module from the remote app.
      </p>
      <div data-testid="remote-component-wrapper">
        <FederatedMessage />
      </div>
    </main>
  )
}
