import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/selective-client-only')({
  ssr: false,
  component: SelectiveClientOnlyRoute,
})

function SelectiveClientOnlyRoute() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h2>Selective remote route content</h2>
    </main>
  )
}
