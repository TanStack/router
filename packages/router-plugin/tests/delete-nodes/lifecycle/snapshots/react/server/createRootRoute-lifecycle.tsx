import { createRootRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
export const Route = createRootRoute({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
  },
  component: () => <div className="p-2">root</div>,
})
