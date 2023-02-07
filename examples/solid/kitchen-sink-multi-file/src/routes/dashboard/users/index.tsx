import { Loader, useLoaderInstance } from '@tanstack/solid-loaders'
import {
  Link,
  MatchRoute,
  Outlet,
  Route,
  useNavigate,
  useSearch,
} from '@tanstack/solid-router'
import { createEffect, createMemo, createSignal, For } from 'solid-js'
import { z } from 'zod'
import { dashboardRoute } from '..'
import { Spinner } from '../../../components/Spinner'
import { fetchUsers } from '../../../mockTodos'

const usersViewSortBy = z.enum(['name', 'id', 'email'])
export type UsersViewSortBy = z.infer<typeof usersViewSortBy>

export const usersLoader = new Loader({
  key: 'users',
  loader: async () => {
    console.log('Fetching users...')
    return fetchUsers()
  },
})

export const usersRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: 'users',
  component: () => <Users />,
  validateSearch: z.object({
    usersView: z
      .object({
        sortBy: usersViewSortBy.optional(),
        filterBy: z.string().optional(),
      })
      .optional(),
  }).parse,
  preSearchFilters: [
    // Persist (or set as default) the usersView search param
    // while navigating within or to this route (or it's children!)
    (search) => ({
      ...search,
      usersView: {
        ...search.usersView,
      },
    }),
  ],
  onLoad: async ({ preload }) => usersLoader.load({ preload }),
})

function Users() {
  const navigate = useNavigate({ from: usersRoute.id })
  const usersLoaderInstance = useLoaderInstance({ key: usersLoader.key })
  const users = () => usersLoaderInstance.state.data
  const search = useSearch({ from: usersRoute.id })

  const sortBy = () => search.usersView?.sortBy ?? 'name'
  const filterBy = () => search.usersView?.filterBy ?? ''

  const [filterDraft, setFilterDraft] = createSignal(filterBy() ?? '')

  const sortedUsers = createMemo(() => {
    if (!users) return []

    return !sortBy
      ? users()
      : [...users()].sort((a, b) => {
          return a[sortBy()] > b[sortBy()] ? 1 : -1
        })
  })

  const filteredUsers = createMemo(() => {
    if (!filterBy()) return sortedUsers()

    return sortedUsers().filter((user) =>
      user.name.toLowerCase().includes(filterBy().toLowerCase()),
    )
  }, [sortedUsers, filterBy])

  const setSortBy = (sortBy: UsersViewSortBy) =>
    navigate({
      search: (old) => {
        return {
          ...old,
          usersView: {
            sortBy,
          },
        }
      },
      replace: true,
    })

  createEffect(() => {
    const filter = filterDraft()
    navigate({
      search: (old) => {
        return {
          ...old,
          usersView: {
            ...old?.usersView,
            filterBy: filter || undefined,
          },
        }
      },
      replace: true,
    })
  })

  return (
    <div class="flex-1 flex">
      <div class="divide-y">
        <div class="py-2 px-3 flex gap-2 items-center bg-gray-100">
          <div>Sort By:</div>
          <select
            value={sortBy()}
            onChange={(e) =>
              setSortBy(e.currentTarget.value as UsersViewSortBy)
            }
            class="flex-1 border p-1 px-2 rounded"
          >
            <For each={['name', 'id', 'email'] as const}>
              {(d) => <option value={d}>{d}</option>}
            </For>
          </select>
        </div>
        <div class="py-2 px-3 flex gap-2 items-center bg-gray-100">
          <div>Filter By:</div>
          <input
            value={filterDraft()}
            onInput={(e) => setFilterDraft(e.currentTarget.value)}
            placeholder="Search Names..."
            class="min-w-0 flex-1 border p-1 px-2 rounded"
          />
        </div>
        <For each={filteredUsers()}>
          {(user) => (
            <div>
              <Link
                to="/dashboard/users/$userId"
                params={{
                  userId: user.id,
                }}
                class="block py-2 px-3 text-blue-700"
                activeProps={{ class: `font-bold` }}
              >
                <pre class="text-sm">
                  {user.name}{' '}
                  <MatchRoute
                    to="/dashboard/users/$userId"
                    params={{
                      userId: user.id,
                    }}
                    pending
                  >
                    <Spinner />
                  </MatchRoute>
                </pre>
              </Link>
            </div>
          )}
        </For>
      </div>
      <div class="flex-initial border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}
