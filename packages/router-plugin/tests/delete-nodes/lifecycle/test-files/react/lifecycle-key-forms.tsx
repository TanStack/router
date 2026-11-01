import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'

const dehydrate = ({ data }) => toWire(data)
const hydrate = ({ data }) => fromWire(data)

export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate,
    hydrate,
    revalidate: true,
  },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    'dehydrate': ({ data }) => toWire(data),
    "hydrate": ({ data }) => fromWire(data),
  },
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate({ data }) {
      return toWire(data)
    },
    async hydrate({ data }) {
      return fromWire(data)
    },
  },
  component: () => <div className="p-2">hello world</div>,
})
