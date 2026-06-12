import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

type SearchState = {
  filter?: string
  page?: number
  q?: string
}

function validateSearch(search: Record<string, unknown>): SearchState {
  const page = Number(search.page)

  return {
    filter: typeof search.filter === 'string' ? search.filter : undefined,
    page: Number.isFinite(page) ? page : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }
}

export const Route = createRootRoute({
  component: RootComponent,
  validateSearch,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
