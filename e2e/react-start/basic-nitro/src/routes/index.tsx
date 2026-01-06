import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

export const Route = createFileRoute('/')({
  loader: () => getData(),
  component: Home,
})

const getData = createServerFn().handler(() => {
  return {
    message: `Running in Node.js ${process.version}`,
    runtime: 'Nitro',
  }
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
      <p data-testid="message">{data.message}</p>
      <p data-testid="runtime">{data.runtime}</p>
    </div>
  )
}
