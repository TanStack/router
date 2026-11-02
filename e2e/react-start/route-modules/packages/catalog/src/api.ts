import { notFound } from '@tanstack/react-router'
import { createServerFn, createMiddleware } from './routeScope.gen'
import { Money } from './money'

// Module-local: only the catalog's server functions run it.
const pricing = createMiddleware({ type: 'function' }).server(
  ({ context, next }) =>
    next({ context: { currency: context.shopper === 'ada' ? 'EUR' : 'USD' } }),
)

const products = [
  { id: 'lamp', name: 'Desk lamp', cents: 4900 },
  { id: 'chair', name: 'Office chair', cents: 12900 },
]

export const listProducts = createServerFn()
  .middleware([pricing])
  .handler(({ context }) =>
    products.map((product) => ({
      id: product.id,
      name: product.name,
      price: new Money(product.cents, context.currency),
    })),
  )

export const getProduct = createServerFn()
  .middleware([pricing])
  .validator((id: string) => id)
  .handler(({ data, context }) => {
    const product = products.find((candidate) => candidate.id === data)
    if (!product) {
      throw notFound()
    }
    return {
      id: product.id,
      name: product.name,
      price: new Money(product.cents, context.currency),
      shopper: context.shopper,
      renderedAt: Date.now(),
    }
  })
