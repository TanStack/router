import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <main>
      <h1>Home</h1>
      <p>There's nothing on this page. Check out the blog.</p>
    </main>
  ),
})
