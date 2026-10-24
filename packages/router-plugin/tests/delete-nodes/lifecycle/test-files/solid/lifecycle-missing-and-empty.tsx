import { createFileRoute } from '@tanstack/solid-router'
import { fromWire } from './client-only'

export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
  },
  loader: {
    hydrate: ({ data }) => fromWire(data),
  },
  component: () => <div className="p-2">hello world</div>,
})
