import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  context: { handler: () => ({ value: 'context' }) },
  loader: {},
  component: () => <div className="p-2">hello world</div>,
})
