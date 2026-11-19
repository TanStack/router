import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

// The state of this file. The handler of `recordVisit` writes it, and the
// loader and the component read it.
const visits: Array<string> = []

const recordVisit = createServerFn({ method: 'POST' })
  .validator((page: string) => page)
  .handler(({ data }) => {
    visits.push(data)
    return visits.length
  })

export const Route = createFileRoute('/visits')({
  loader: async () => {
    const count = await recordVisit({ data: '/visits' })
    return { count, pages: [...visits] }
  },
  component: VisitsPage,
})

function VisitsPage() {
  const { count } = Route.useLoaderData()

  return (
    <main>
      <h1>{count} visits</h1>
      <button onClick={() => recordVisit({ data: '/visits' })}>
        Visit again ({visits.length})
      </button>
    </main>
  )
}
