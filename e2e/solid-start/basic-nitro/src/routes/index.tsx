import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

export const Route = createFileRoute('/')({
  loader: () => getData(),
  component: Home,
})

const getData = createServerFn().handler(() => {
  return {
    message: `Running in ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}`,
    runtime: 'Nitro',
  }
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div class="p-2">
      <h3>Welcome Home!!!</h3>
      <p data-testid="message">{data().message}</p>
      <p data-testid="runtime">{data().runtime}</p>
    </div>
  )
}
