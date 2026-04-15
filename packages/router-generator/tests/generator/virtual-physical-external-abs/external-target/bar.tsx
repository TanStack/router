import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/external/bar')({
  component: () => 'bar',
})
