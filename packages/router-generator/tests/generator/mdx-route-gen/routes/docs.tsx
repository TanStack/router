import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/docs')({
  component: () => <div>Docs</div>,
})
