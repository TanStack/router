import { createFileRoute, useNavigate, persistSearchParams } from '@tanstack/react-router'
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
      persistSearchParams(),
    ],
  },
  component: UsersComponent,
})

const mockUsers = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', status: 'active' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', status: 'inactive' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', status: 'active' },
  { id: 4, name: 'Diana Ross', email: 'diana@example.com', status: 'active' },
  { id: 5, name: 'Edward Norton', email: 'edward@example.com', status: 'inactive' },
  { id: 6, name: 'Fiona Apple', email: 'fiona@example.com', status: 'active' },
  { id: 7, name: 'George Lucas', email: 'george@example.com', status: 'active' },
  { id: 8, name: 'Helen Hunt', email: 'helen@example.com', status: 'inactive' },
  { id: 9, name: 'Ian McKellen', email: 'ian@example.com', status: 'active' },
  { id: 10, name: 'Julia Roberts', email: 'julia@example.com', status: 'active' },
  { id: 11, name: 'Kevin Costner', email: 'kevin@example.com', status: 'inactive' },
  { id: 12, name: 'Lisa Simpson', email: 'lisa@example.com', status: 'active' },
]

function UsersComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const filteredUsers = React.useMemo(() => {
    let users = mockUsers

    if (search.name) {
      users = users.filter(user => 
        user.name.toLowerCase().includes(search.name?.toLowerCase() || '')
      )
    }

    if (search.status && search.status !== 'all') {
      users = users.filter(user => user.status === search.status)
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
      <p>Search parameters are automatically persisted when you navigate away and back</p>
      
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
          <div key={user.id} className="border p-2 rounded">
            <div className="font-bold">{user.name}</div>
            <div className="text-sm text-gray-600">{user.email}</div>
            <div className="text-sm">{user.status}</div>
          </div>
        ))}
      </div>
    </div>
  )
}