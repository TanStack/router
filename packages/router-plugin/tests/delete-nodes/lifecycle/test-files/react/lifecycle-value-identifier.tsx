import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import { toContextWire } from './context-server-only'
import { fromContextWire } from './context-client-only'
import type { ContextOptions } from './types'

const loaderOptions = {
  handler: () => ({ value: 'loader' }),
  dehydrate: ({ data }) => toWire(data),
  hydrate: ({ data }) => fromWire(data),
}

const contextOptions = {
  handler: () => ({ value: 'context' }),
  dehydrate: ({ data }) => toContextWire(data),
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
