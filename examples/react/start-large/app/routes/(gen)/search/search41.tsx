import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'
import { queryOptions } from '@tanstack/react-query'

const search = z.object({
  search41: z.literal('search41'),
  page: z.number(),
  offset: z.number(),
  search: z.string(),
})

const loaderResult = z.object({
  search41: z.number(),
})

const searchQueryOptions = queryOptions({
  queryKey: ['search41'],
  queryFn: () => {
    const result = loaderResult.parse({
      search41: 0,
    })

    return result
  },
})

export const Route = createFileRoute('/(gen)/search/search41')({
  component: SearchComponent,
  validateSearch: search,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(searchQueryOptions),
})

function SearchComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/search/search41"
        className="block py-1 text-blue-800 hover:text-blue-600"
        search={{
          search41: 'search41',
          page: 0,
          offset: 10,
          search: 'search',
          rootSearch: 0,
        }}
      >
        Search
      </Link>
    </div>
  )
}
