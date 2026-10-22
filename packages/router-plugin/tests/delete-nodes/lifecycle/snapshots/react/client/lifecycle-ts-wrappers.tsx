import { createFileRoute } from '@tanstack/react-router'
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
  component: () => <div className="p-2">hello world</div>,
})
