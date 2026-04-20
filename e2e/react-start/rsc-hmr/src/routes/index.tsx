import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main data-testid="home" style={{ padding: 16 }}>
      <h1>RSC CSS HMR playground</h1>
      <p>
        Open one of the routes above and edit the corresponding CSS file in
        <code> src/utils/ </code> to exercise CSS HMR through the RSC renderer.
      </p>
    </main>
  )
}
