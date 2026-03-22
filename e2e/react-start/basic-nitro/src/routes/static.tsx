import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

export const Route = createFileRoute('/static')({
  loader: () => getData(),
  component: StaticPage,
})

const getData = createServerFn().handler(() => {
  return {
    generatedAt: new Date().toISOString(),
    runtime: 'Nitro',
  }
})

function StaticPage() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h1 data-testid="static-heading">Static Page</h1>
      <p data-testid="static-content">
        This page was prerendered with {data.runtime}
      </p>
      <p data-testid="generated-at">Generated at: {data.generatedAt}</p>
    </div>
  )
}
