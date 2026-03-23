import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

export const Route = createFileRoute('/')({
  loader: () => getData(),
  component: Home,
})

const getData = createServerFn().handler(() => {
  return {
    message: 'Hello from Nitro server!',
    timestamp: new Date().toISOString(),
  }
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h3 data-testid="home-heading">Welcome Home!</h3>
      <p data-testid="message">{data.message}</p>
      <p data-testid="timestamp">Loaded at: {data.timestamp}</p>
    </div>
  )
}
