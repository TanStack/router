import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'
import { queryOptions } from '@tanstack/react-query'

const search = z.object({
  search76: z.literal('search76'),
  page: z.number(),
  offset: z.number(),
  search: z.string(),
})

const loaderResult = z.object({
  search76: z.number(),
})

const searchQueryOptions = queryOptions({
  queryKey: ['search76'],
  queryFn: () => {
    const result = loaderResult.parse({
      search76: 0,
    })

    return result
  },
})

export const Route = createFileRoute('/(gen)/search/search76')({
  component: SearchComponent,
  validateSearch: search,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(searchQueryOptions),
})

function SearchComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/search/search76"
        className="block py-1 text-blue-800 hover:text-blue-600"
        search={{
          search76: 'search76',
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
