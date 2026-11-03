import { createFileRoute } from '@tanstack/solid-router'
import { toWire } from './server-only'
export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
  },
  ssr: true,
} satisfies RouteOptions)
