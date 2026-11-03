import { createFileRoute } from '@tanstack/react-router'
import { fromWire } from './client-only'
const options = {
  loader: {
    handler: () => ({ value: 'loader' }),
    hydrate: ({ data }) => fromWire(data),
  },
  component: () => <div className="p-2">hello world</div>,
}
export const Route = createFileRoute('/')(options)
