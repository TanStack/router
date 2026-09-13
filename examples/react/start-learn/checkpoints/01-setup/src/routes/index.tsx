import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return (
    <main>
      <h1>Field notes</h1>
      <p>Keep a record of what you learn.</p>
    </main>
  )
}
