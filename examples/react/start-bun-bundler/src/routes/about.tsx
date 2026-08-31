import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>About</h1>
      <p>Second route to exercise Bun code-splitting.</p>
      <p>
        <Link to="/">Home</Link>
      </p>
    </main>
  )
}
