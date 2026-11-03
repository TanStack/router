import { createFileRoute } from '@tanstack/solid-router'
import { fromWire } from './client-only'
export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    hydrate: ({ data }) => fromWire(data),
    revalidate: true,
  },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    hydrate: ({ data }) => fromWire(data),
  } as const,
  loader: {
    handler: () => ({ value: 'loader' }),
    hydrate: ({ data }) => fromWire(data),
  } satisfies LoaderOptions,
  component: () => <div class="p-2">hello world</div>,
})
