import { createServerFn } from '@tanstack/react-start'

const catalog = {
  router: {
    name: 'TanStack Router',
    description: 'Type-safe URL state shared by web and native clients.',
  },
  start: {
    name: 'TanStack Start',
    description: 'Server functions compiled for both clients.',
  },
} as const

export const getWelcome = createServerFn({ method: 'GET' }).handler(() => ({
  message: 'This value came from a TanStack Start server function.',
  generatedAt: new Date().toISOString(),
}))

export const searchCatalog = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(({ data }) => {
    const normalized = data.trim().toLowerCase()
    return Object.values(catalog).filter((item) =>
      `${item.name} ${item.description}`.toLowerCase().includes(normalized),
    )
  })

export const getCatalogItem = createServerFn({ method: 'GET' })
  .validator((id: keyof typeof catalog) => id)
  .handler(({ data }) => catalog[data])
