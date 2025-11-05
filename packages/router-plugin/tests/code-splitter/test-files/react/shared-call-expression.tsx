import { createFileRoute } from '@tanstack/react-router'

// Call expression initializers - should still work
const collection = { create: (name: string) => ({ name, items: [] }) }.create(
  'todos',
)
const query = { from: (table: string) => ({ table, filters: [] }) }.from(
  'users',
)

export const Route = createFileRoute('/test')({
  loader: async () => {
    return collection.items
  },
  component: TestComponent,
})

function TestComponent() {
  return (
    <div>
      {collection.name} - {query.table}
    </div>
  )
}
