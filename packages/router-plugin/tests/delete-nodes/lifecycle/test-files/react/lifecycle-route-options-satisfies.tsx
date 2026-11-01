import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import type { RouteOptions } from './types'

export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    revalidate: true,
  },
  ssr: true,
} satisfies RouteOptions)
