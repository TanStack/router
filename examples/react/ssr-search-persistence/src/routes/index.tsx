import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">
        Welcome to SSR Search Persistence!
      </h2>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">🔍 How It Works</h3>
        <ul className="space-y-2 text-sm">
          <li>• Search parameters are persisted per route using middleware</li>
          <li>• Each route isolates its search params (no contamination!)</li>
          <li>• SSR-safe: per-request store instances prevent state leakage</li>
          <li>• Client hydration maintains search state seamlessly</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Try the examples:</h3>
        <div className="space-x-4">
          <Link
            to="/products"
            search={{ category: 'electronics', minPrice: 100 }}
            className="inline-block bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Products with Search
          </Link>
          <Link
            to="/users"
            search={{ name: 'john', status: 'active' }}
            className="inline-block bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            Users with Search
          </Link>
        </div>
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">🧪 Test Instructions</h3>
        <ol className="space-y-1 text-sm list-decimal list-inside">
          <li>Navigate to Products, set search filters</li>
          <li>Navigate to Users, set different search filters</li>
          <li>Navigate back to Products - your filters persist!</li>
          <li>Navigate back to Users - different filters persist!</li>
          <li>Refresh the page - search params restore correctly</li>
        </ol>
      </div>
    </div>
  )
}
