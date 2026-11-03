import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  context: { handler: () => ({ value: 'context' }), dehydrate: true },
  beforeLoad: { handler: () => ({ value: 'beforeLoad' }), dehydrate: false },
  loader: { handler: () => ({ value: 'loader' }), dehydrate: true },
  component: () => <div className="p-2">hello world</div>,
})
