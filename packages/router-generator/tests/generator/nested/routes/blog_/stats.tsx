import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/blog/stats')({
  component: () => <div>Hello /blog/stats!</div>,
})
