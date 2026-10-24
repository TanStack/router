import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <h1>Session Handling E2E</h1>
      <p>This app contains HTTP-level session tests.</p>
    </main>
  )
}
