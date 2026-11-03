import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  context: { handler: () => ({ value: 'context' }), revalidate: false },
  beforeLoad: { handler: () => ({ value: 'beforeLoad' }) },
  loader: { handler: () => ({ value: 'loader' }), hydrate: ({ data }) => data },
  component: () => <div className="p-2">hello world</div>,
})
