import * as v from 'valibot'

const search = v.object({
  rootSearch: v.number(),
})

export const Route = createFileRoute({
  component: () => <div>Hello /search!</div>,
  validateSearch: search,
})
