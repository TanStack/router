import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/root')({
  component: () => <div>Hello !</div>,
})
