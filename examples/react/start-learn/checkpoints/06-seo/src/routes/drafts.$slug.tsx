import { getCurrentUser } from '../server/session'
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { getOwnNote } from '../server/notes'
export const Route = createFileRoute('/drafts/$slug')({
  beforeLoad: async () => {
    if (!(await getCurrentUser())) {
      throw redirect({
        to: '/login',
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
  },
  loader: {
    staleReloadMode: 'blocking',
    handler: async ({ params }) => {
      if (params.slug.length > 80) {
        throw notFound()
      }
      const note = await getOwnNote({ data: params.slug })
      if (!note) {
        throw notFound()
      }
      return note
    },
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: Note,
})
function Note() {
  const note = Route.useLoaderData()
  return (
    <main>
      <Link to="/dashboard">My notes</Link>
      <h1>{note.title}</h1>
      <p>{note.body}</p>
    </main>
  )
}
