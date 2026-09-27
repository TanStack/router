import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'

const setSsrResponseFn = createServerFn().handler(() => {
  setResponseStatus(238, 'ssr-loader')
  setResponseHeader('x-ssr-loader', 'yes')
  setCookie('ssr-one', '1', { path: '/' })
  setCookie('ssr-two', '2', { path: '/' })
  return { message: 'ssr response' }
})

export const Route = createFileRoute('/ssr')({
  loader: () => setSsrResponseFn(),
  component: SsrRoute,
})

function SsrRoute() {
  const data = Route.useLoaderData()
  return (
    <main>
      <h1 data-testid="ssr-message">{data.message}</h1>
    </main>
  )
}
