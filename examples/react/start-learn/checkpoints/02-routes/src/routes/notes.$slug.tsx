import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { notes } from '../notes'
export const Route = createFileRoute('/notes/$slug')({
  loader: ({ params }) => {
    const note = notes.find((item) => item.slug === params.slug)
    if (!note) {
      throw notFound()
    }
    return note
  },
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
