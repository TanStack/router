import { createFileRoute } from '@tanstack/react-router'

// Nested closure - ensure we track through closures
const cfg = { api: 'http://api.com' }
const makeLoader = () => () => cfg.api
const Component = () => <div>{cfg.api}</div>

export const Route = createFileRoute('/test')({
  loader: makeLoader(),
  component: Component,
})
