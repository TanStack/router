/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  Link,
  createRoute,
  useLoaderData,
  useNavigate,
  useSearch,
} from '@tanstack/remix-router'
import { on } from '@remix-run/ui'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

interface CatalogSearch {
  q: string
  page: number
  sort: 'asc' | 'desc'
}

const ITEMS = [
  'Apricot',
  'Blueberry',
  'Cherry',
  'Date',
  'Elderberry',
  'Fig',
  'Grape',
  'Huckleberry',
  'Iyokan',
  'Jackfruit',
]

/**
 * Search-params driven view. Demonstrates:
 *  - `validateSearch` parsing URL query string into a typed shape
 *  - `loaderDeps` selecting which params force a refetch (q + page,
 *    not sort — sort is purely client-side)
 *  - `<Link search={(prev) => …}>` updating a single param via a
 *    functional updater
 *  - A controlled form with `on('submit', …)` calling `useNavigate`
 *
 * The reactivity flowing through `useSearch` exercises the same atom
 * subscribe path as `<Match>` — any URL change emits, the binding's
 * adapted teardown disconnects on unmount.
 */
function CatalogPage(handle: Handle) {
  const readSearch = useSearch(handle, { from: '/catalog' })
  const readData = useLoaderData(handle, { from: '/catalog' })
  const navigate = useNavigate(handle)

  let pendingQ = ''

  return () => {
    const search = readSearch() as CatalogSearch
    const data = readData() as { items: Array<string>; total: number } | undefined

    return (
      <main>
        <h1>Catalog</h1>
        <p>
          Current search:{' '}
          <code>q={search.q || '(none)'}</code>{' '}
          <code>page={search.page}</code>{' '}
          <code>sort={search.sort}</code>
        </p>

        <form
          mix={[
            on<HTMLFormElement, 'submit'>('submit', (e: SubmitEvent) => {
              e.preventDefault()
              void navigate({
                to: '/catalog',
                search: (prev: CatalogSearch) => ({
                  ...prev,
                  q: pendingQ,
                  page: 1,
                }),
              })
            }),
          ]}
        >
          <input
            type="text"
            placeholder="Search"
            value={search.q}
            mix={[
              on<HTMLInputElement, 'input'>('input', (e: InputEvent) => {
                pendingQ = (e.target as HTMLInputElement).value
              }),
            ]}
          />
          <button type="submit">Search</button>
        </form>

        <p>
          <Link
            to="/catalog"
            search={(prev: CatalogSearch) => ({
              ...prev,
              sort: prev.sort === 'asc' ? 'desc' : 'asc',
            })}
          >
            Toggle sort ({search.sort})
          </Link>
          {' · '}
          <Link
            to="/catalog"
            search={(prev: CatalogSearch) => ({
              ...prev,
              page: Math.max(1, prev.page - 1),
            })}
          >
            ← Prev
          </Link>
          {' · '}
          <Link
            to="/catalog"
            search={(prev: CatalogSearch) => ({ ...prev, page: prev.page + 1 })}
          >
            Next →
          </Link>
        </p>

        <p>
          <em>
            Showing page {search.page} of {data?.total ?? '?'} items
            {search.q ? ` matching "${search.q}"` : ''}.
          </em>
        </p>
        <ol start={(search.page - 1) * 3 + 1}>
          {(data?.items ?? []).map((item) => <li key={item}>{item}</li>)}
        </ol>
      </main>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/catalog',
  validateSearch: (raw: Record<string, unknown>): CatalogSearch => ({
    q: typeof raw.q === 'string' ? raw.q : '',
    page: typeof raw.page === 'number' ? raw.page : 1,
    sort: raw.sort === 'desc' ? 'desc' : 'asc',
  }),
  loaderDeps: ({ search }: { search: CatalogSearch }) => ({
    q: search.q,
    page: search.page,
  }),
  loader: ({ deps }: { deps: { q: string; page: number } }) => {
    const filtered = ITEMS.filter((item) =>
      item.toLowerCase().includes(deps.q.toLowerCase()),
    )
    const start = (deps.page - 1) * 3
    const items = filtered.slice(start, start + 3)
    return { items, total: filtered.length }
  },
  component: CatalogPage,
})
