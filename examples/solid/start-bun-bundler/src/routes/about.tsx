import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main style={{ 'font-family': 'system-ui', padding: '24px' }}>
      <h1>About</h1>
      <p>Second route to exercise Bun code-splitting.</p>
      <p>
        <a href="/">Home</a>
      </p>
    </main>
  )
}
