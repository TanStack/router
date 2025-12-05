import { createFileRoute } from '@tanstack/solid-router'

// Variable references another shared variable
const baseConfig = { apiUrl: 'http://api.com', timeout: 5000 }
const collection = { config: baseConfig, name: 'todos' }

export const Route = createFileRoute('/test')({
  loader: async () => {
    return collection.name
  },
  component: TestComponent,
})

function TestComponent() {
  return (
    <div>
      {collection.name} - {baseConfig.apiUrl}
    </div>
  )
}
