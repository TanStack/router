import { createFileRoute } from '@tanstack/react-router'
import { fromWire } from './client-only'
const hydrate = ({ data }) => fromWire(data)
export const Route = createFileRoute('/')({
  context: { handler: () => ({ value: 'context' }), hydrate, revalidate: true },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    hydrate: ({ data }) => fromWire(data),
  },
  loader: {
    handler: () => ({ value: 'loader' }),
    async hydrate({ data }) {
      return fromWire(data)
    },
  },
  component: () => <div className="p-2">hello world</div>,
})
