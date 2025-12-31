import { createFileRoute } from '@tanstack/react-router'
import { getPunkSongs } from '~/data/fn'

export const Route = createFileRoute('/')({
  component: RouteComponent,
  loader: async () => {
    return await getPunkSongs()
  },
  // Disable SSR to show the cache headers in cURL requests
  ssr: false,
})

function RouteComponent() {
  const data = Route.useLoaderData()

  return (
    <main>
      <h1>Hello world!</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </main>
  )
}
