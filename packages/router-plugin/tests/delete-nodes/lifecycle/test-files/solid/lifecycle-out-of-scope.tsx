import { createFileRoute } from '@tanstack/solid-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import { loaderOptions } from './loader-options'
import { sharedOptions } from './shared-options'
import { makeContext } from './make-context'

const key = 'dehydrate'
const contextOptions = makeContext({
  handler: () => ({ value: 'context' }),
  dehydrate: ({ data }) => toWire(data),
  hydrate: ({ data }) => fromWire(data),
})

export const Route = createFileRoute('/')({
  ...sharedOptions,
  context: contextOptions,
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    [key]: ({ data }) => toWire(data),
  },
  loader: loaderOptions,
  component: () => <div className="p-2">hello world</div>,
})
