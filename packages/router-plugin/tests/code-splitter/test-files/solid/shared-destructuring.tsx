import { createFileRoute } from '@tanstack/solid-router'

// Destructuring - ensure we promote the right binding
const cfg = { apiUrl: 'http://api.com', timeout: 5000 }
const { apiUrl } = cfg

export const Route = createFileRoute('/test')({
  loader: async () => {
    // Uses the destructured binding
    return fetch(apiUrl).then(r => r.json())
  },
  component: TestComponent,
})

function TestComponent() {
  // Also uses the destructured binding
  return <div>API: {apiUrl}</div>
}
