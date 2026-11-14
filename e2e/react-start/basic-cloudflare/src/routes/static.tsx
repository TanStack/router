import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { content } from '../cache-fixture'

export const Route = createFileRoute('/static')({
  loader: () => getData(),
  component: StaticPage,
})

const getData = createServerFn().handler(() => {
  return {
    myVar: content.value,
  }
})

function StaticPage() {
  const data = Route.useLoaderData()

  return (
    <div>
      <h1 data-testid="static-heading">Static Page</h1>
      <p data-testid="static-content">The value is {data.myVar}</p>
    </div>
  )
}
