import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-2">
      <h3>Search Persistence Middleware Demo</h3>
      <p>
        Navigate to Users or Products and filter some data, then navigate back
        to see persistence in action!
      </p>

      <div className="mt-4 p-4 border rounded bg-yellow-50">
        <h4 className="font-bold mb-2">🧪 Restoration Patterns</h4>

        <p className="text-sm mb-2">Full restoration:</p>
        <div className="space-x-2 mb-3">
          <Link
            to="/users"
            search={(prev) => prev}
            className="inline-block bg-purple-500 text-white px-3 py-1 rounded text-sm"
          >
            Users (restore all)
          </Link>
          <Link
            to="/products"
            search={(prev) => prev}
            className="inline-block bg-orange-500 text-white px-3 py-1 rounded text-sm"
          >
            Products (restore all)
          </Link>
        </div>

        <p className="text-sm mb-2">Partial override:</p>
        <div className="space-x-2 mb-3">
          <Link
            to="/products"
            search={(prev) => ({ ...prev, category: 'Electronics' })}
            className="inline-block bg-yellow-600 text-white px-3 py-1 rounded text-sm"
          >
            Products (Electronics)
          </Link>
          <Link
            to="/products"
            search={(prev) => ({ ...prev, category: 'Books' })}
            className="inline-block bg-yellow-700 text-white px-3 py-1 rounded text-sm"
          >
            Products (Books)
          </Link>
        </div>

        <p className="text-sm mb-2">Clean navigation (no restoration):</p>
        <div className="space-x-2">
          <Link
            to="/users"
            className="inline-block bg-blue-500 text-white px-3 py-1 rounded text-sm"
          >
            Users (clean)
          </Link>
          <Link
            to="/products"
            className="inline-block bg-green-500 text-white px-3 py-1 rounded text-sm"
          >
            Products (clean)
          </Link>
        </div>
      </div>
    </div>
  )
}
