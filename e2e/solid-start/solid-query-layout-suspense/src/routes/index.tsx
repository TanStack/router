import { Link, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  loader: async () => {
    await new Promise((r) => setTimeout(r, 50))
    return { message: 'hello' }
  },
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  return (
    <main>
      <div data-testid="index-content">Home: {data().message}</div>
      <Link
        to="/$slug"
        params={{ slug: 'my-slug' }}
        data-testid="index-link-to-slug"
      >
        Go to slug
      </Link>
    </main>
  )
}
