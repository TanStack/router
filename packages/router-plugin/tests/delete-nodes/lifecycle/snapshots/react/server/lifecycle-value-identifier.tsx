import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { toContextWire } from './context-server-only'
const loaderOptions = {
  handler: () => ({ value: 'loader' }),
  dehydrate: ({ data }) => toWire(data),
}
const contextOptions = {
  handler: () => ({ value: 'context' }),
  dehydrate: ({ data }) => toContextWire(data),
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
