import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

export const Route = createFileRoute('/static')({
  loader: () => getStaticData(),
  component: StaticPage,
})

const getStaticData = createServerFn().handler(() => {
  return {
    content: 'This page was prerendered at build time',
    buildTime: new Date().toISOString(),
  }
})

function StaticPage() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h1 data-testid="static-heading">Static Page</h1>
      <p data-testid="static-content">{data.content}</p>
      <p data-testid="build-time">Build time: {data.buildTime}</p>
    </div>
  )
}
