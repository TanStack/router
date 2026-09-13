import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { listNotes } from '../server/notes'
export const Route = createFileRoute('/')({
  validateSearch: z.object({ q: z.string().max(200).catch('') }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listNotes({ data: deps }),
  headers: () => ({ 'Cache-Control': 'no-store' }),
  head: ({ loaderData, match }) => ({
    meta: [
      { title: 'Field notes | Learn Start' },
      {
        name: 'description',
        content: 'Published notes from the Learn Start notebook.',
      },
      ...(match.loaderDeps.q ? [{ name: 'robots', content: 'noindex' }] : []),
    ],
    links:
      loaderData && !match.loaderDeps.q
        ? [{ rel: 'canonical', href: loaderData.canonical }]
        : [],
  }),
  component: Home,
})
function Home() {
  const { q } = Route.useSearch()
  const { notes } = Route.useLoaderData()
  return (
    <main>
      <h1>Field notes</h1>
      <Link to="/dashboard">My notes</Link>
      <form method="get">
        <label>
          Search notes <input name="q" defaultValue={q} maxLength={200} />
        </label>
        <button type="submit">Search</button>
      </form>
      <ul>
        {notes.map((note) => (
          <li key={note.slug}>
            <Link to="/notes/$slug" params={{ slug: note.slug }}>
              {note.title}
            </Link>{' '}
            ({note.categoryName})
          </li>
        ))}
      </ul>
      {notes.length === 0 ? <p>No matching notes.</p> : null}
    </main>
  )
}
