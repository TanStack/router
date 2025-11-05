import { createFileRoute } from '@tanstack/react-router'

// Multiple declarations in same const statement
// Only collection1 is shared, but both are in same declaration
const collection1 = { name: 'todos' }, collection2 = { name: 'users' }

export const Route = createFileRoute('/test')({
  loader: async () => {
    return collection1.name
  },
  component: TestComponent,
})

function TestComponent() {
  return (
    <div>
      {collection1.name} {collection2.name}
    </div>
  )
}
