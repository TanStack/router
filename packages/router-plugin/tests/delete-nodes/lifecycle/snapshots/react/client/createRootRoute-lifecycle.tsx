import { createRootRoute } from '@tanstack/react-router'
import { fromWire } from './client-only'
export const Route = createRootRoute({
  context: {
    handler: () => ({ value: 'context' }),
    hydrate: ({ data }) => fromWire(data),
    revalidate: ({ prev }) => prev,
  },
  component: () => <div className="p-2">root</div>,
})
