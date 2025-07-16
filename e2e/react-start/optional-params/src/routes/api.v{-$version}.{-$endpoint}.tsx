import { Link } from '@tanstack/react-router'

// Mock API data
const endpoints = {
  '1': ['overview', 'users', 'posts'],
  '2': ['overview', 'users', 'posts', 'auth'],
  '3': ['overview', 'users', 'posts', 'auth', 'webhooks'],
}

export const Route = createFileRoute({
  component: APIComponent,
})

function APIComponent() {
  const { version = '1', endpoint = 'overview' } = Route.useParams()
  const availableEndpoints =
    endpoints[version as keyof typeof endpoints] || endpoints['1']

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-6">
          API Documentation v{version} - {endpoint}
        </h2>

        <div className="mb-6">
          <div className="mb-4">
            <h3 className="font-semibold mb-2">API Versions</h3>
            <div className="flex gap-3">
              <Link
                to="/api/v{-$version}/{-$endpoint}"
                params={{ version: '1' }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                data-testid="api-v1-link"
              >
                v1
              </Link>
              <Link
                to="/api/v{-$version}/{-$endpoint}"
                params={{ version: '2' }}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                data-testid="api-v2-link"
              >
                v2
              </Link>
              <Link
                to="/api/v{-$version}/{-$endpoint}"
                params={{ version: '3' }}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                data-testid="api-v3-link"
              >
                v3
              </Link>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Endpoints</h3>
            <div className="flex gap-2 flex-wrap">
              {availableEndpoints.map((ep) => (
                <Link
                  key={ep}
                  to="/api/v{-$version}/{-$endpoint}"
                  params={{ version, endpoint: ep }}
                  activeProps={{ className: 'bg-gray-700' }}
                  className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                  data-testid={`api-endpoint-${ep}-link`}
                >
                  {ep}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-bold text-lg mb-4">
            API v{version} - {endpoint}
          </h3>
          <p className="text-gray-700 mb-4">
            Documentation for the{' '}
            <code className="bg-white px-2 py-1 rounded">{endpoint}</code>{' '}
            endpoint in API version {version}.
          </p>

          <div className="bg-white border rounded p-4">
            <h4 className="font-semibold mb-2">Endpoint Details</h4>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium">Base URL:</span>{' '}
              https://api.example.com/v{version}/{endpoint}
            </p>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium">Methods:</span> GET, POST
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Available in:</span>{' '}
              {availableEndpoints.join(', ')}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Current URL State</h3>
        <p className="text-sm text-gray-700">
          <span className="font-medium">Version (optional):</span>{' '}
          {version || 'undefined (defaults to 1)'}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-medium">Endpoint (optional):</span>{' '}
          {endpoint || 'undefined (defaults to overview)'}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-medium">URL pattern:</span>{' '}
          <code>/api/v{'{-$version}/{-$endpoint}'}</code>
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-medium">Note:</span> This uses prefix pattern
          where 'v' is always present
        </p>
      </div>
    </div>
  )
}
