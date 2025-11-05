import { createFileRoute } from '@tanstack/react-router'

// Module-level variable used in both loader and component
// This simulates a collection/query that should only be initialized once
const collection = { name: 'todos', preload: async () => {} }

// Side effect at module level - should only run once
console.log('Module initialized:', collection.name)

export const Route = createFileRoute('/todos')({
  loader: async () => {
    // Use collection in loader
    await collection.preload()
    return { data: 'loaded' }
  },
  component: TodosComponent,
})

function TodosComponent() {
  // Use collection in component
  return <div>{collection.name}</div>
}
