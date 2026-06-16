import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
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
