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
  queryKey: ['param26'],
  queryFn: () => {
    return loaderResult.parse({})
  },
})

export const Route = createFileRoute('/(gen)/params/$param26')({
  component: ParamsComponent,
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(paramsQueryOptions),
})

function ParamsComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/params/$param26"
        params={{
          param26: 'params',
        }}
      />
    </div>
  )
}
