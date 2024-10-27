import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/nested-docs/$project/$version/docs/framework/$framework/',
)({
  component: () => <div>Selected a post by it's ID.</div>,
})
