import { createFileRoute } from '@tanstack/react-router'

// Alias chain - ensure we track through aliases
const base = { name: 'collection', items: [] }
const alias = base

export const Route = createFileRoute('/test')({
  loader: async () => {
    return alias.items
  },
  component: TestComponent,
})

function TestComponent() {
  return <div>{alias.name}</div>
}
