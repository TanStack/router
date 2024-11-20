import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'
import { queryOptions } from '@tanstack/react-query'

const search = z.object({
  search28: z.literal('search28'),
  page: z.number(),
  offset: z.number(),
  search: z.string(),
})

const loaderResult = z.object({
  search28: z.number(),
})

const searchQueryOptions = queryOptions({
  queryKey: ['search28'],
  queryFn: () => {
    const result = loaderResult.parse({
      search28: 0,
    })

    return result
  },
})

export const Route = createFileRoute('/(gen)/search/search28')({
  component: SearchComponent,
  validateSearch: search,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(searchQueryOptions),
})

function SearchComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/search/search28"
        className="block py-1 text-blue-800 hover:text-blue-600"
        search={{
          search28: 'search28',
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
