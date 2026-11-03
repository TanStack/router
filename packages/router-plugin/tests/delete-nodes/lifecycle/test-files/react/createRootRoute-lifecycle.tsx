import { createRootRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'

export const Route = createRootRoute({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    revalidate: ({ prev }) => prev,
  },
  component: () => <div className="p-2">root</div>,
})
