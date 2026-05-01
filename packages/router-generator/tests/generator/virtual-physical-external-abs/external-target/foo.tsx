import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/external/foo')({
  component: () => 'foo',
})
