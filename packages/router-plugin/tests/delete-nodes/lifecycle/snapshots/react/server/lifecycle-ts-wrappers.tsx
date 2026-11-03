import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
  },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    dehydrate: ({ data }) => toWire(data),
  } as const,
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => toWire(data),
  } satisfies LoaderOptions,
  component: () => <div className="p-2">hello world</div>,
})
