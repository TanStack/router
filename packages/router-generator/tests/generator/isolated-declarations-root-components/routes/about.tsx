import { createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/about')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
  }),
})
