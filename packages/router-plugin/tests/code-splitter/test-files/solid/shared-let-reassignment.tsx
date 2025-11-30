import { createFileRoute } from '@tanstack/solid-router'

// let with reassignment - tests live binding behavior
let store = { count: 0 }
store = { count: 1, updated: true }

export const Route = createFileRoute('/test')({
  loader: async () => {
    store.count++
    return { data: 'loaded' }
  },
  component: TestComponent,
})

function TestComponent() {
  return <div>Count: {store.count}</div>
}
