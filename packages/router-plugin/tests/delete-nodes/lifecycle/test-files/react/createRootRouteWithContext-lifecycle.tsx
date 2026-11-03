import { createRootRouteWithContext } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'

export const Route = createRootRouteWithContext<{ auth: unknown }>()({
  context: {
    handler: ({ context }) => ({ auth: context.auth }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    revalidate: ({ prev }) => prev,
  },
  component: () => <div className="p-2">root</div>,
})
