import { createLazyFileRoute, useSearch } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/(group)/lazyinside')({
  component: () => {
    const searchViaHook = useSearch({ from: '/(group)/lazyinside' })
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
