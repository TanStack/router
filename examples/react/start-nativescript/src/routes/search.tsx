import { createFileRoute } from '@tanstack/react-router'
import { searchCatalog } from '~/server/catalog'
import { SearchScreen } from '~/screens/SearchScreen'

type SearchState = {
  q: string
}

export const Route = createFileRoute('/search')({
  validateSearch: (search): SearchState => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchCatalog({ data: deps.q }),
  component: SearchRoute,
  native: {
    title: 'Search',
  },
})

function SearchRoute() {
  return (
    <SearchScreen query={Route.useSearch().q} results={Route.useLoaderData()} />
  )
}
