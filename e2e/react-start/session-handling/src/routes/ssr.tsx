import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { sessionConfig } from '~/session'

const loadSession = createServerFn().handler(async () => {
  const session = await useSession<Record<string, any>>(sessionConfig())
  const count = Number(session.data.ssrCount ?? 0) + 1
  await session.update({ ssrCount: count })
  return {
    id: session.id,
    data: session.data,
  }
})

export const Route = createFileRoute('/ssr')({
  loader: () => loadSession(),
  component: SsrRoute,
})

function SsrRoute() {
  const data = Route.useLoaderData()
  return (
    <main>
      <h1>SSR Session</h1>
      <p data-testid="ssr-session-id">{data.id}</p>
      <p data-testid="ssr-session-count">{String(data.data.ssrCount)}</p>
    </main>
  )
}
