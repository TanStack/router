import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
const dehydrate = ({ data }) => toWire(data)
export const Route = createFileRoute('/')({
  context: { handler: () => ({ value: 'context' }), dehydrate },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    dehydrate: ({ data }) => toWire(data),
  },
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate({ data }) {
      return toWire(data)
    },
  },
  component: () => <div className="p-2">hello world</div>,
})
