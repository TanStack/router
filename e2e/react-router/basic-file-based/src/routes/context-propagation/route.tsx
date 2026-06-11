import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/context-propagation')({
  beforeLoad: () => ({ number: 42 }),
})
