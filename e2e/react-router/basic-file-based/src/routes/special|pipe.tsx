import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/special|pipe')({
  component: () => <div>Hello /special|pipe!</div>,
})
