import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { readSession } from '~/session'

const loadSession = createServerFn().handler(async () => {
  const session = await readSession()
  const count = Number(session.ssrCount ?? 0) + 1
  session.ssrCount = count
  await session.save()
  return { count }
})

export const Route = createFileRoute('/ssr')({
  loader: () => loadSession(),
  component: SsrRoute,
})

function SsrRoute() {
  const data = Route.useLoaderData()
  return (
    <main>
      <h1>External Session SSR</h1>
      <p data-testid="ssr-session-count">{String(data.count)}</p>
    </main>
  )
}
