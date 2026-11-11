import { notFound } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from './routeScope.gen'

// Module-local: only this module's server functions run it.
const audience = createMiddleware({ type: 'function' }).server(
  ({ context, next }) =>
    next({ context: { audience: `${context.viewer} in __MODULE_ID__` } }),
)

const items = Array.from({ length: 24 }, (_, index) => ({
  id: `item-${index + 1}`,
  name: `__TITLE__ item ${index + 1}`,
  quantity: (index * 7) % 13,
}))

export const listItems = createServerFn()
  .middleware([audience])
  .handler(({ context }) => ({
    audience: context.audience,
    items: items.slice(0, 8).map(({ id, name }) => ({ id, name })),
  }))

export const getItem = createServerFn()
  .middleware([audience])
  .validator((id: string) => id)
  .handler(({ data, context }) => {
    const item = items.find((candidate) => candidate.id === data)
    if (!item) {
      throw notFound()
    }
    return { ...item, viewedBy: context.audience }
  })

const pageSize = 6

/** Filters the items on whichever side runs the loader. */
export function searchItems(query: string, page: number) {
  const matches = items.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  )
  return {
    items: matches.slice((page - 1) * pageSize, page * pageSize),
    hasMore: matches.length > page * pageSize,
  }
}
