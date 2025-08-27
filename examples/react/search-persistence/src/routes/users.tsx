import {
  createFileRoute,
  useNavigate,
  persistSearchParams,
  retainSearchParams,
  stripSearchParams,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import { z } from 'zod'
import React from 'react'

const usersSearchSchema = z.object({
  name: z.string().optional().catch(''),
  status: z.enum(['active', 'inactive', 'all']).optional().catch('all'),
  page: z.number().optional().catch(0),
  limit: z.number().optional().catch(10),
})

export type UsersSearchSchema = z.infer<typeof usersSearchSchema>

export const Route = createFileRoute('/users')({
  validateSearch: usersSearchSchema,
  search: {
    middlewares: [
      retainSearchParams(['name', 'status', 'page']),
      persistSearchParams(['name', 'status', 'page']),
      stripSearchParams(['limit']),
    ],
  },
  component: UsersComponent,
})

const mockUsers = [
  {
    id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    status: 'active',
  },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', status: 'inactive' },
  {
    id: 3,
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    status: 'active',
  },
  { id: 4, name: 'Diana Ross', email: 'diana@example.com', status: 'active' },
  {
    id: 5,
    name: 'Edward Norton',
    email: 'edward@example.com',
    status: 'inactive',
  },
  { id: 6, name: 'Fiona Apple', email: 'fiona@example.com', status: 'active' },
  {
    id: 7,
    name: 'George Lucas',
    email: 'george@example.com',
    status: 'active',
  },
  { id: 8, name: 'Helen Hunt', email: 'helen@example.com', status: 'inactive' },
  { id: 9, name: 'Ian McKellen', email: 'ian@example.com', status: 'active' },
  {
    id: 10,
    name: 'Julia Roberts',
    email: 'julia@example.com',
    status: 'active',
  },
  {
    id: 11,
    name: 'Kevin Costner',
    email: 'kevin@example.com',
    status: 'inactive',
  },
  { id: 12, name: 'Lisa Simpson', email: 'lisa@example.com', status: 'active' },
]

function UsersComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const location = useLocation()

  // Extract userId from pathname like "/users/123"
  const currentUserId = location.pathname.startsWith('/users/')
    ? location.pathname.split('/users/')[1]?.split('?')[0]
    : null

  const filteredUsers = React.useMemo(() => {
    let users = mockUsers

    if (search.name) {
      users = users.filter((user) =>
        user.name.toLowerCase().includes(search.name?.toLowerCase() || ''),
      )
    }

    if (search.status && search.status !== 'all') {
      users = users.filter((user) => user.status === search.status)
    }

    return users
  }, [search.name, search.status])

  const updateSearch = (updates: Partial<UsersSearchSchema>) => {
    navigate({
      search: (prev: UsersSearchSchema) => ({ ...prev, ...updates, page: 0 }),
    } as any)
  }

  return (
    <div className="p-2">
      <h3>Users</h3>
      <p>
        Search parameters are automatically persisted when you navigate away and
        back
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <h4 className="font-medium text-blue-800 mb-2">
          Testing Middleware Chain:
        </h4>
        <p className="text-sm text-blue-700">
          1. Apply filters below (name, status) <br />
          2. Click "View Details" on any user <br />
          3. Switch between tabs (Profile, Activity, Settings) <br />
          4. Click "← Back" and then "View Details" again <br />
          5. See both retained filters AND persisted tab selections!
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <input
          type="text"
          placeholder="Search by name..."
          value={search.name || ''}
          onChange={(e) => updateSearch({ name: e.target.value })}
          className="border p-2 rounded"
        />

        <select
          value={search.status || 'all'}
          onChange={(e) => updateSearch({ status: e.target.value as any })}
          className="border p-2 rounded"
        >
          <option value="all">All Users</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <button
          type="button"
          onClick={() => navigate({ search: {} } as any)}
          className="border p-2 rounded"
        >
          Reset
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {filteredUsers.map((user) => (
          <div key={user.id}>
            <div className="border p-2 rounded flex justify-between items-center">
              <div>
                <div className="font-bold">{user.name}</div>
                <div className="text-sm text-gray-600">{user.email}</div>
                <div className="text-sm">{user.status}</div>
              </div>
              {currentUserId === user.id.toString() ? (
                <Link
                  to="/users"
                  search={(prev) => prev}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                >
                  ← Back
                </Link>
              ) : (
                <Link
                  to="/users/$userId"
                  params={{ userId: user.id.toString() }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                >
                  View Details
                </Link>
              )}
            </div>
            {currentUserId === user.id.toString() && (
              <div className="mt-2">
                <Outlet />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
