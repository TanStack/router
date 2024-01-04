import * as React from 'react'
import {
  FileRoute,
  Link,
  MatchRoute,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import { fetchUsers } from '../utils/mockTodos'
import { Spinner } from '../components/Spinner'
import { z } from 'zod'

type UsersViewSortBy = 'name' | 'id' | 'email'

export const Route = new FileRoute('/dashboard/users').createRoute({
  validateSearch: z.object({
    usersView: z
      .object({
        sortBy: z.enum(['name', 'id', 'email']).optional(),
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
  loaderDeps: ({ search }) => ({
    filterBy: search.usersView?.filterBy,
    sortBy: search.usersView?.sortBy,
  }),
  loader: ({ deps }) => fetchUsers(deps),
  component: UsersComponent,
})

function UsersComponent() {
  const navigate = useNavigate({from: Route.fullPath})
  const { usersView } = Route.useSearch()
  const users = Route.useLoaderData()
  const sortBy = usersView?.sortBy ?? 'name'
  const filterBy = usersView?.filterBy

  const [filterDraft, setFilterDraft] = React.useState(filterBy ?? '')

  React.useEffect(() => {
    setFilterDraft(filterBy ?? '')
  }, [filterBy])

  const setSortBy = (sortBy: UsersViewSortBy) =>
    navigate({
      search: (old) => {
        return {
          ...old,
          usersView: {
            ...(old?.usersView ?? {}),
            sortBy,
          },
        }
      },
      replace: true,
    })

  React.useEffect(() => {
    navigate({
      search: (old) => {
        return {
          ...old,
          usersView: {
            ...old?.usersView,
            filterBy: filterDraft || undefined,
          },
        }
      },
      replace: true,
    })
  }, [filterDraft])

  return (
    <div className="flex-1 flex">
      <div className="divide-y">
        <div className="py-2 px-3 flex gap-2 items-center bg-gray-100">
          <div>Sort By:</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as UsersViewSortBy)}
            className="flex-1 border p-1 px-2 rounded"
          >
            {['name', 'id', 'email'].map((d) => {
              return <option key={d} value={d} children={d} />
            })}
          </select>
        </div>
        <div className="py-2 px-3 flex gap-2 items-center bg-gray-100">
          <div>Filter By:</div>
          <input
            value={filterDraft}
            onChange={(e) => setFilterDraft(e.target.value)}
            placeholder="Search Names..."
            className="min-w-0 flex-1 border p-1 px-2 rounded"
          />
        </div>
        {users?.map((user) => {
          return (
            <div key={user.id}>
              <Link
                to="/dashboard/users/user"
                search={(d) => ({
                  ...d,
                  userId: user.id,
                })}
                className="block py-2 px-3 text-blue-700"
                activeProps={{ className: `font-bold` }}
              >
                <pre className="text-sm">
                  {user.name}{' '}
                  <MatchRoute
                    to="/dashboard/users/user"
                    search={(d) => ({
                      ...d,
                      userId: user.id,
                    })}
                    pending
                  >
                    {(match) => <Spinner show={!!match} wait="delay-50" />}
                  </MatchRoute>
                </pre>
              </Link>
            </div>
          )
        })}
      </div>
      <div className="flex-initial border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}
