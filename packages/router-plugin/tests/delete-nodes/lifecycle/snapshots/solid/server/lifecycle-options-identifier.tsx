import { createFileRoute } from '@tanstack/solid-router'
import { toWire } from './server-only'
const options = {
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => toWire(data),
  },
  component: () => <div className="p-2">hello world</div>,
}
export const Route = createFileRoute('/')(options)
