import { createFileRoute } from '@tanstack/solid-router'

// Object contains methods (functions) - should still be shared as whole object
const api = {
  endpoint: 'http://api.com',
  fetch: async () => ({ data: 'loaded' }),
  cache: new Map()
}

export const Route = createFileRoute('/test')({
  loader: async () => {
    return api.fetch()
  },
  component: TestComponent,
})

function TestComponent() {
  return (
    <div>
      {api.endpoint} - Cache size: {api.cache.size}
    </div>
  )
}
