import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { getRequestHeader } from '@tanstack/solid-start/server'
import { env } from 'cloudflare:workers'

export const Route = createFileRoute('/')({
  loader: () => getData(),
  component: Home,
})

const getData = createServerFn().handler(() => {
  return {
    message: `Running in ${navigator.userAgent}`,
    myVar: env.MY_VAR,
    requestHeader: getRequestHeader('x-solid-start-context'),
  }
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div class="p-2">
      <h3>Welcome Home!!!</h3>
      <p data-testid="message">{data().message}</p>
      <p data-testid="myVar">{data().myVar}</p>
      <p data-testid="requestHeader">{data().requestHeader}</p>
    </div>
  )
}
