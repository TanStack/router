import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import * as v from 'valibot'
import { queryOptions } from '@tanstack/react-query'

const search = v.object({
  searchPlaceholder: v.literal('searchPlaceholder'),
  page: v.number(),
  offset: v.number(),
  search: v.string(),
})

const loaderResult = v.object({
  searchPlaceholder: v.number(),
})

const searchQueryOptions = queryOptions({
  queryKey: ['searchPlaceholder'],
  queryFn: () => {
    const result = v.parse(loaderResult, {
      searchPlaceholder: 0,
    })

    return result
  },
})

export const Route = createFileRoute('/search/searchPlaceholder')({
  component: SearchComponent,
  validateSearch: search,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(searchQueryOptions),
})

function SearchComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/search/searchPlaceholder"
        className="block py-1 text-blue-800 hover:text-blue-600"
        search={{
          searchPlaceholder: 'searchPlaceholder',
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
