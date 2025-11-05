import { createFileRoute } from '@tanstack/solid-router'

// Multiple declarators in same statement
// Only 'shared' is used by both loader and component
// 'a' is only used in component, should NOT be exported
const a = 1, shared = new Map()

export const Route = createFileRoute('/test')({
  loader: async () => {
    // Only uses shared, not a
    shared.set('loaded', true)
    return { data: 'loaded' }
  },
  component: TestComponent,
})

function TestComponent() {
  // Uses both shared and a
  return <div>Count: {shared.size + a}</div>
}
