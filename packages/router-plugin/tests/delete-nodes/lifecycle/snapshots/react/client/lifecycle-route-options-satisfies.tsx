import { createFileRoute } from '@tanstack/react-router'
import { fromWire } from './client-only'
export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    hydrate: ({ data }) => fromWire(data),
    revalidate: true,
  },
} satisfies RouteOptions)
