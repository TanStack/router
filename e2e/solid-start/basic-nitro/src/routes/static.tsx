import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/static')({
  component: StaticPage,
})

function StaticPage() {
  return (
    <div>
      <h1 data-testid="static-heading">Static Page</h1>
      <p data-testid="static-content">This page was prerendered with Nitro</p>
    </div>
  )
}
