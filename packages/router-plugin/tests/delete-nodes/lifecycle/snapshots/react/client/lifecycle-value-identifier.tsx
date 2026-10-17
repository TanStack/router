import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import { fromContextWire } from './context-client-only'
const loaderOptions = {
  handler: () => ({ value: 'loader' }),
  hydrate: ({ data }) => fromWire(data),
}
const contextOptions = {
  handler: () => ({ value: 'context' }),
  hydrate: ({ data }) => fromContextWire(data),
  revalidate: () => true,
} satisfies ContextOptions
let beforeLoadOptions = {
  handler: () => ({ value: 'beforeLoad' }),
  dehydrate: ({ data }) => toWire(data),
}
beforeLoadOptions = { ...beforeLoadOptions, dehydrate: false }
export const Route = createFileRoute('/')({
  context: contextOptions,
  beforeLoad: beforeLoadOptions,
  loader: loaderOptions,
  component: () => <div className="p-2">hello world</div>,
})
