import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'

const options = {
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  },
  component: () => <div className="p-2">hello world</div>,
}

export const Route = createFileRoute('/')(options)
