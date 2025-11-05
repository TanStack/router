import { createFileRoute } from '@tanstack/solid-router'

// Variable used inside nested function
const collection = { name: 'todos', items: [] }

function loadData() {
  return collection.items
}

export const Route = createFileRoute('/test')({
  loader: loadData,
  component: TestComponent,
})

function TestComponent() {
  return <div>{collection.name}</div>
}
