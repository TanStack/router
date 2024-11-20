import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { queryOptions } from '@tanstack/react-query'

const params = z.object({
  oneParamsPlaceholder: z.literal('oneParamsPlaceholder'),
  twoParamsPlaceholder: z.literal('twoParamsPlaceholder'),
  threeParamsPlaceholder: z.literal('threeParamsPlaceholder'),
})

const loaderResult = z.object({
  params,
})

const paramsQueryOptions = queryOptions({
  queryKey: ['param93'],
  queryFn: () => {
    return loaderResult.parse({})
  },
})

export const Route = createFileRoute('/(gen)/params/$param93')({
  component: ParamsComponent,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(paramsQueryOptions),
})

function ParamsComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/params/$param93"
        params={{
          param93: 'params',
        }}
      />
    </div>
  )
}
