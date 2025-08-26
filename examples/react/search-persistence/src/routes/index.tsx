import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Search Persistence Middleware
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Navigate to Users or Products, filter some data, then navigate back to
          see persistence in action!
        </p>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-8 shadow-lg">
        <div className="flex items-center mb-6">
          <span className="text-2xl mr-3">🧪</span>
          <h2 className="text-2xl font-semibold text-gray-900">
            Test Restoration Patterns
          </h2>
        </div>

        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="w-6 h-6 bg-green-500 rounded-full text-white text-sm flex items-center justify-center mr-3">
                ✓
              </span>
              Full Restoration
            </h3>
            <p className="text-gray-600 mb-4">
              Clean navigation - middleware automatically restores saved
              parameters
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/users"
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
              >
                Users (auto-restore)
              </Link>
              <Link
                to="/products"
                className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
              >
                Products (auto-restore)
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center mr-3">
                ~
              </span>
              Partial Override
            </h3>
            <p className="text-gray-600 mb-4">
              Restore saved parameters but override specific ones
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/products"
                search={(prev) => ({ ...prev, category: 'Electronics' })}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
              >
                Products → Electronics
              </Link>
              <Link
                to="/products"
                search={(prev) => ({ ...prev, category: 'Books' })}
                className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
              >
                Products → Books
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="w-6 h-6 bg-gray-500 rounded-full text-white text-sm flex items-center justify-center mr-3">
                ×
              </span>
              Clean Navigation
            </h3>
            <p className="text-gray-600 mb-4">
              Navigate without any parameter restoration
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/users"
                className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
              >
                Users (clean slate)
              </Link>
              <Link
                to="/products"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
              >
                Products (clean slate)
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>💡 Tip:</strong> Try filtering data on the Users or Products
            pages, then use these buttons to test different restoration
            behaviors.
          </p>
        </div>
      </div>
    </div>
  )
}
