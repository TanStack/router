import { createFileRoute, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import { zodSearchValidator } from '@tanstack/router-zod-adapter'

export const Route = createFileRoute('/(group)/_layout/inside')({
  validateSearch: zodSearchValidator(
    z.object({ hello: z.string().optional() }),
  ),
  component: () => {
    const searchViaHook = useSearch({ from: '/(group)/_layout/inside' })
    const searchViaRouteHook = Route.useSearch()
    return (
      <>
        <div data-testid="search-via-hook">{searchViaHook.hello}</div>
        <div data-testid="search-via-route-hook">
          {searchViaRouteHook.hello}
        </div>
      </>
    )
  },
})
