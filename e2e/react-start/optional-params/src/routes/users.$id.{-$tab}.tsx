import { Link } from '@tanstack/react-router'

// Mock user data
const users = {
  '1': { id: '1', name: 'John Doe', email: 'john@example.com' },
  '2': { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
}

export const Route = createFileRoute({
  component: UserComponent,
})

function UserComponent() {
  const { id, tab = 'profile' } = Route.useParams()
  const user = users[id as keyof typeof users]

  if (!user) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-red-600 mb-4">User Not Found</h2>
        <p className="text-gray-600">No user found with ID: {id}</p>
        <Link
          to="/users/$id/{-$tab}"
          params={{ id: '1' }}
          className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          View User 1
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-6">
          {user.name} - {tab}
        </h2>

        <div className="mb-6 flex gap-3">
          <Link
            to="/users/$id/{-$tab}"
            params={{ id }}
            activeProps={{ className: 'bg-blue-600' }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            data-testid="user-profile-link"
          >
            Profile
          </Link>
          <Link
            to="/users/$id/{-$tab}"
            params={{ id, tab: 'settings' }}
            activeProps={{ className: 'bg-green-600' }}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            data-testid="user-settings-link"
          >
            Settings
          </Link>
          <Link
            to="/users/$id/{-$tab}"
            params={{ id, tab: 'activity' }}
            activeProps={{ className: 'bg-purple-600' }}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
            data-testid="user-activity-link"
          >
            Activity
          </Link>
        </div>

        <div className="bg-gray-50 rounded-lg p-6">
          {tab === 'profile' && (
            <div>
              <h3 className="font-bold text-lg mb-4">Profile Information</h3>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">Name:</span> {user.name}
                </p>
                <p>
                  <span className="font-medium">Email:</span> {user.email}
                </p>
                <p>
                  <span className="font-medium">User ID:</span> {user.id}
                </p>
              </div>
            </div>
          )}
          {tab === 'settings' && (
            <div>
              <h3 className="font-bold text-lg mb-4">Settings</h3>
              <p className="text-gray-600">
                User settings configuration would be displayed here.
              </p>
              <div className="mt-4 space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" />
                  Email notifications
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" />
                  Push notifications
                </label>
              </div>
            </div>
          )}
          {tab === 'activity' && (
            <div>
              <h3 className="font-bold text-lg mb-4">Recent Activity</h3>
              <p className="text-gray-600 mb-4">
                User activity feed would be displayed here.
              </p>
              <div className="space-y-2">
                <div className="p-3 bg-white rounded border">
                  <p className="text-sm">Logged in from Chrome on Windows</p>
                  <p className="text-xs text-gray-500">2 hours ago</p>
                </div>
                <div className="p-3 bg-white rounded border">
                  <p className="text-sm">Updated profile information</p>
                  <p className="text-xs text-gray-500">1 day ago</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Current URL State</h3>
        <p className="text-sm text-gray-700">
          <span className="font-medium">User ID (required):</span> {id}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-medium">Tab (optional):</span>{' '}
          {tab || 'undefined (defaults to profile)'}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-medium">URL pattern:</span>{' '}
          <code>/users/$id/{'{-$tab}'}</code>
        </p>
      </div>
    </div>
  )
}
