import { Link, createFileRoute } from '../routeScope.gen'
import { searchItems } from '../api'

export const Route = createFileRoute('__MODULE_ID__:/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    page: Math.max(1, Number(search.page) || 1),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchItems(deps.q, deps.page),
  component: Search,
})

function Search() {
  const { q, page } = Route.useSearch()
  const results = Route.useLoaderData()
  const navigate = Route.useNavigate()
  return (
    <>
      <input
        type="search"
        aria-label="Search items"
        value={q}
        onChange={(event) =>
          navigate({ search: { q: event.target.value, page: 1 } })
        }
      />
      <ul className="rows">
        {results.items.map((item) => (
          <li key={item.id}>
            <Link to="/$itemId" params={{ itemId: item.id }}>
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
      {results.hasMore ? (
        <Link to="/search" search={{ q, page: page + 1 }}>
          Next results
        </Link>
      ) : null}
    </>
  )
}
