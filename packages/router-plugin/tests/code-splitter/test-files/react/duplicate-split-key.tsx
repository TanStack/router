import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <div>first</div>,
  component: () => <div>last</div>,
})
