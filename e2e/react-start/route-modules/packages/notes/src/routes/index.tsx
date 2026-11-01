import { createFileRoute } from '../routeScope.gen'

// A router-only module: the application that mounts it serializes this result.
export const Route = createFileRoute('@start-route-modules/notes:/')({
  loader: () => ({ notes: ['Compose route modules', 'Ship it'] }),
  component: NotesPage,
})

function NotesPage() {
  const { notes } = Route.useLoaderData()
  return (
    <ul className="rows" data-testid="notes">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  )
}
