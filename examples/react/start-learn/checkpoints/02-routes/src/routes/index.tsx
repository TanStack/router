import { createFileRoute, Link } from '@tanstack/react-router'
import { notes } from '../notes'
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  component: Home,
})
function Home() {
  const { q } = Route.useSearch()
  const matches = notes.filter((note) =>
    note.title.toLowerCase().includes(q.toLowerCase()),
  )
  return (
    <main>
      <h1>Field notes</h1>
      <form method="get">
        <label>
          Search notes <input name="q" defaultValue={q} />
        </label>
        <button type="submit">Search</button>
      </form>
      <ul>
        {matches.map((note) => (
          <li key={note.slug}>
            <Link to="/notes/$slug" params={{ slug: note.slug }}>
              {note.title}
            </Link>
          </li>
        ))}
      </ul>
      {matches.length === 0 ? <p>No matching notes.</p> : null}
    </main>
  )
}
