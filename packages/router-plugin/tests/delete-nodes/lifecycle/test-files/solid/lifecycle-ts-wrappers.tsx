import { createFileRoute } from '@tanstack/solid-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import type { LoaderOptions } from './types'

export const Route = createFileRoute('/')({
  context: ({
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    revalidate: true,
  }),
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  } as const,
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  } satisfies LoaderOptions,
  component: () => <div class="p-2">hello world</div>,
})
