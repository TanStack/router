import { createFileRoute } from '@tanstack/react-router'
import { FederatedMessage } from 'mf_remote/message'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h1>Host application</h1>
      <p>This page renders a module exposed by the remote application.</p>
      <FederatedMessage />
    </main>
  )
}
