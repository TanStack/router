import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { readHomeData } from '../cache-fixture'

export const Route = createFileRoute('/')({
  loader: () => getData(),
  headers: ({ loaderData }) => ({
    'Cache-Control': loaderData?.cacheControl ?? 'private, no-store',
  }),
  component: Home,
})

const getData = createServerFn().handler(() => readHomeData())

function Home() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
      <p data-testid="message">{data.message}</p>
      <p data-testid="myVar">{data.myVar}</p>
    </div>
  )
}
