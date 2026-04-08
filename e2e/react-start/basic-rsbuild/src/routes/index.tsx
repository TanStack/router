import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div>
      <h1 data-testid="home-heading">Welcome Home</h1>
      <p data-testid="home-message">This is the rsbuild e2e test app.</p>
    </div>
  )
}
