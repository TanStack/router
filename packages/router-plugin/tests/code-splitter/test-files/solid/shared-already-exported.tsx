import { createFileRoute } from '@tanstack/solid-router'

// Already exported variable - should not be double-exported
export const collection = { name: 'todos', preload: async () => {} }

export const Route = createFileRoute('/test')({
  loader: async () => {
    await collection.preload()
    return { data: 'loaded' }
  },
  component: TestComponent,
})

function TestComponent() {
  return <div>{collection.name}</div>
}
