import {
  createFileRoute,
  retainSearchParams,
  persistSearchParams,
  Link,
} from '@tanstack/react-router'
import { z } from 'zod'

const userDetailSearchSchema = z.object({
  name: z.string().optional().catch(''),
  status: z.enum(['active', 'inactive', 'all']).optional().catch('all'),
  page: z.number().optional().catch(0),
  tab: z.enum(['profile', 'activity', 'settings']).optional().catch('profile'),
})

export type UserDetailSearchSchema = z.infer<typeof userDetailSearchSchema>

export const Route = createFileRoute('/users/$userId')({
  validateSearch: userDetailSearchSchema,
  search: {
    middlewares: [
      retainSearchParams(['name', 'status', 'page']),
      persistSearchParams(['tab']),
    ],
  },
  component: UserDetailComponent,
})

const mockUsers = [
  {
    id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    status: 'active',
    department: 'Engineering',
    role: 'Senior Developer',
  },
  {
    id: 2,
    name: 'Bob Smith',
    email: 'bob@example.com',
    status: 'inactive',
    department: 'Marketing',
    role: 'Marketing Manager',
  },
  {
    id: 3,
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    status: 'active',
    department: 'Design',
    role: 'UI Designer',
  },
  {
    id: 4,
    name: 'Diana Ross',
    email: 'diana@example.com',
    status: 'active',
    department: 'Sales',
    role: 'Sales Director',
  },
  {
    id: 5,
    name: 'Edward Norton',
    email: 'edward@example.com',
    status: 'inactive',
    department: 'Engineering',
    role: 'DevOps Engineer',
  },
  {
    id: 6,
    name: 'Fiona Apple',
    email: 'fiona@example.com',
    status: 'active',
    department: 'Product',
    role: 'Product Manager',
  },
  {
    id: 7,
    name: 'George Lucas',
    email: 'george@example.com',
    status: 'active',
    department: 'Engineering',
    role: 'Tech Lead',
  },
  {
    id: 8,
    name: 'Helen Hunt',
    email: 'helen@example.com',
    status: 'inactive',
    department: 'HR',
    role: 'HR Manager',
  },
  {
    id: 9,
    name: 'Ian McKellen',
    email: 'ian@example.com',
    status: 'active',
    department: 'Legal',
    role: 'Legal Counsel',
  },
  {
    id: 10,
    name: 'Julia Roberts',
    email: 'julia@example.com',
    status: 'active',
    department: 'Finance',
    role: 'CFO',
  },
  {
    id: 11,
    name: 'Kevin Costner',
    email: 'kevin@example.com',
    status: 'inactive',
    department: 'Operations',
    role: 'Operations Manager',
  },
  {
    id: 12,
    name: 'Lisa Simpson',
    email: 'lisa@example.com',
    status: 'active',
    department: 'Engineering',
    role: 'Junior Developer',
  },
]

function UserDetailComponent() {
  const { userId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const user = mockUsers.find((u) => u.id.toString() === userId)

  if (!user) {
    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold text-red-600">User Not Found</h2>
        <Link to="/users" className="text-blue-500 hover:underline">
          ← Back to Users
        </Link>
      </div>
    )
  }

  const updateTab = (tab: UserDetailSearchSchema['tab']) => {
    const newSearch = {
      name: search.name,
      status: search.status,
      page: search.page,
      tab: tab,
    }

    navigate({
      search: newSearch,
    })
  }

  return (
    <div className="p-4">
      <div className="space-y-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-medium text-green-800 mb-2">
            🔄 Retained from Users List (retainSearchParams):
          </h4>
          <div className="text-sm space-y-1">
            <div>
              Name Filter:{' '}
              <span className="font-mono bg-green-100 px-2 py-1 rounded">
                {search.name || '(none)'}
              </span>
            </div>
            <div>
              Status Filter:{' '}
              <span className="font-mono bg-green-100 px-2 py-1 rounded">
                {search.status || 'all'}
              </span>
            </div>
            <div>
              Page:{' '}
              <span className="font-mono bg-green-100 px-2 py-1 rounded">
                {search.page || 0}
              </span>
            </div>
          </div>
          <p className="text-xs text-green-600 mt-2">
            These search parameters were retained from the Users list when you
            navigated here!
          </p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-medium text-purple-800 mb-2">
            💾 Persisted on This Route (persistSearchParams):
          </h4>
          <div className="text-sm text-purple-700">
            <div>
              Active Tab:{' '}
              <span className="font-mono bg-purple-100 px-2 py-1 rounded text-purple-900">
                {search.tab || 'profile'}
              </span>
            </div>
            <div className="mt-1 text-xs">
              Route: <span className="font-mono">/users/{userId}</span>
            </div>
          </div>
          <p className="text-xs text-purple-600 mt-2">
            This tab selection will be restored when you navigate back to this
            user!
          </p>
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-md p-6">
        <div className="flex items-center mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl ${
              user.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
            }`}
          >
            {user.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-600">
              {user.role} • {user.department}
            </p>
          </div>
          <div className="ml-auto">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {user.status}
            </span>
          </div>
        </div>

        <div className="border-b border-gray-200 mb-4">
          <nav className="flex space-x-6">
            {(['profile', 'activity', 'settings'] as const).map((tab) => {
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => updateTab(tab)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    search.tab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="mt-4">
          {search.tab === 'profile' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Profile Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-sm font-medium text-gray-700">
                    Email
                  </span>
                  <p className="mt-1 text-sm text-gray-900">{user.email}</p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-700">
                    Department
                  </span>
                  <p className="mt-1 text-sm text-gray-900">
                    {user.department}
                  </p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-700">
                    Role
                  </span>
                  <p className="mt-1 text-sm text-gray-900">{user.role}</p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-700">
                    User ID
                  </span>
                  <p className="mt-1 text-sm text-gray-900">{user.id}</p>
                </div>
              </div>
            </div>
          )}

          {search.tab === 'activity' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Recent Activity</h3>
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4">
                  <p className="text-sm text-gray-900">
                    Logged in to the system
                  </p>
                  <p className="text-xs text-gray-500">2 hours ago</p>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <p className="text-sm text-gray-900">
                    Updated profile information
                  </p>
                  <p className="text-xs text-gray-500">1 day ago</p>
                </div>
                <div className="border-l-4 border-yellow-500 pl-4">
                  <p className="text-sm text-gray-900">Changed password</p>
                  <p className="text-xs text-gray-500">3 days ago</p>
                </div>
              </div>
            </div>
          )}

          {search.tab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">User Settings</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">
                    Email Notifications
                  </span>
                  <input type="checkbox" checked className="rounded" readOnly />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">
                    Two-Factor Authentication
                  </span>
                  <input type="checkbox" className="rounded" readOnly />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">
                    Profile Visibility
                  </span>
                  <select className="border rounded px-2 py-1 text-sm" disabled>
                    <option>Public</option>
                    <option>Private</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
