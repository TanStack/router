import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import * as v from 'valibot'
import { queryOptions } from '@tanstack/react-query'

const params = v.object({
  oneParamsPlaceholder: v.literal('oneParamsPlaceholder'),
  twoParamsPlaceholder: v.literal('twoParamsPlaceholder'),
  threeParamsPlaceholder: v.literal('threeParamsPlaceholder'),
})

const loaderResult = v.object({
  params,
})

const paramsQueryOptions = queryOptions({
  queryKey: ['paramsPlaceholder'],
  queryFn: () => {
    return v.parse(loaderResult, {})
  },
})

export const Route = createFileRoute('/params/$paramsPlaceholder')({
  component: ParamsComponent,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(paramsQueryOptions),
})

function ParamsComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/params/$paramsPlaceholder"
        params={{
          paramsPlaceholder: 'params',
        }}
      />
    </div>
  )
}
