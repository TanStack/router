import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  headers: () => ({ 'x-route-header': 'present' }),
  component: Home,
})

function Home() {
  return (
    <main>
      <h1>Response Reconciliation E2E</h1>
      <p>This app contains HTTP-level regression tests.</p>
    </main>
  )
}
