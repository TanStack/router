import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { getNote } from '../server/notes'
export const Route = createFileRoute('/notes/$slug')({
  loader: async ({ params }) => {
    if (params.slug.length > 80) {
      throw notFound()
    }
    const note = await getNote({ data: params.slug })
    if (!note) {
      throw notFound()
    }
    return note
  },
  headers: () => ({ 'Cache-Control': 'no-store' }),
  component: Note,
})
function Note() {
  const note = Route.useLoaderData()
  return (
    <main>
      <Link to="/" search={{ q: '' }}>
        All notes
      </Link>
      <h1>{note.title}</h1>
      <p>{note.body}</p>
    </main>
  )
}
