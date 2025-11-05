import { createFileRoute } from '@tanstack/solid-router'

// Multiple shared variables used by both loader and component
const collection1 = { name: 'todos', preload: async () => {} }
const collection2 = { name: 'users', preload: async () => {} }
const config = { apiUrl: 'http://api.com' }

export const Route = createFileRoute('/test')({
  loader: async () => {
    await collection1.preload()
    await collection2.preload()
    return { data: 'loaded' }
  },
  component: TestComponent,
})

function TestComponent() {
  return (
    <div>
      {collection1.name} {collection2.name} {config.apiUrl}
    </div>
  )
}
