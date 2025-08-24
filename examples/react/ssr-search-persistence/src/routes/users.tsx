import {
  createFileRoute,
  persistSearchParams,
  useNavigate,
} from '@tanstack/react-router'
import { z } from 'zod'

const usersSearchSchema = z.object({
  name: z.string().optional().catch(''),
  status: z.enum(['active', 'inactive', 'pending']).optional().catch('active'),
  page: z.number().optional().catch(1),
  limit: z.number().optional().catch(10),
})

export type UsersSearchSchema = z.infer<typeof usersSearchSchema>

export const Route = createFileRoute('/users')({
  validateSearch: usersSearchSchema,
  search: {
    middlewares: [persistSearchParams(['name', 'status', 'page'])],
  },
  component: UsersComponent,
})

function UsersComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const updateSearch = (updates: Partial<UsersSearchSchema>) => {
    navigate({ search: { ...search, ...updates } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-4">Users</h2>
        <div className="bg-purple-50 p-3 rounded text-sm">
          <strong>Persisted:</strong> name, status, page |
          <strong> Not persisted:</strong> limit (resets to default)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="name-input"
              className="block text-sm font-medium mb-1"
            >
              Search Name
            </label>
            <input
              id="name-input"
              type="text"
              value={search.name || ''}
              onChange={(e) => updateSearch({ name: e.target.value })}
              placeholder="Enter user name..."
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label
              htmlFor="status-select"
              className="block text-sm font-medium mb-1"
            >
              Status
            </label>
            <select
              id="status-select"
              value={search.status || 'active'}
              onChange={(e) =>
                updateSearch({
                  status: e.target.value as UsersSearchSchema['status'],
                })
              }
              className="w-full border rounded px-3 py-2"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Page</label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() =>
                  updateSearch({ page: Math.max(1, (search.page || 1) - 1) })
                }
                disabled={(search.page || 1) <= 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-1 bg-blue-100 rounded">
                Page {search.page || 1}
              </span>
              <button
                type="button"
                onClick={() => updateSearch({ page: (search.page || 1) + 1 })}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                Next
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="limit-select"
              className="block text-sm font-medium mb-1"
            >
              Items per page (not persisted)
            </label>
            <select
              id="limit-select"
              value={search.limit || 10}
              onChange={(e) => updateSearch({ limit: Number(e.target.value) })}
              className="w-full border rounded px-3 py-2"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => navigate({ search: {} })}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Clear All Filters
          </button>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold mb-2">Current Search State:</h3>
          <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
            {JSON.stringify(search, null, 2)}
          </pre>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded">
        <h3 className="font-semibold mb-2">🎯 Test Search Isolation</h3>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          <li>Set filters here (name, status, page)</li>
          <li>Go to Products, set completely different filters</li>
          <li>Come back - your Users filters are isolated & restored!</li>
          <li>Notice: limit resets to 10 (not in persisted params)</li>
        </ol>
      </div>

      <div className="bg-green-50 p-4 rounded">
        <h3 className="font-semibold mb-2">🔧 SSR Safety</h3>
        <p className="text-sm">
          Each SSR request gets its own SearchPersistenceStore instance,
          preventing cross-request state contamination. Try refreshing the page
          with search params - they'll be restored correctly!
        </p>
      </div>
    </div>
  )
}
