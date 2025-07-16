export const Route = createFileRoute({
  component: Home,
})

function Home() {
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-3xl font-bold mb-4">
          Welcome to Optional Parameters Demo
        </h2>
        <p className="text-gray-600 mb-6">
          This demo showcases various optional parameter patterns in TanStack
          Start + Router:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Blog with Category Filter</h3>
            <code className="text-sm bg-white px-2 py-1 rounded">
              /blog/{'{-$category}'}
            </code>
            <p className="text-sm text-gray-600 mt-2">
              Browse blog posts with optional category filtering
            </p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Documentation Versioning</h3>
            <code className="text-sm bg-white px-2 py-1 rounded">
              /docs/{'{-$version}/{-$page}'}
            </code>
            <p className="text-sm text-gray-600 mt-2">
              Navigate docs with optional version and page parameters
            </p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">User Profiles with Tabs</h3>
            <code className="text-sm bg-white px-2 py-1 rounded">
              /users/$id/{'{-$tab}'}
            </code>
            <p className="text-sm text-gray-600 mt-2">
              User profiles with optional tab navigation
            </p>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Product Catalog Filters</h3>
            <code className="text-sm bg-white px-2 py-1 rounded">
              /products/{'{-$category}/{-$brand}'}
            </code>
            <p className="text-sm text-gray-600 mt-2">
              E-commerce filtering with multiple optional parameters
            </p>
          </div>

          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">File Browser with Extensions</h3>
            <code className="text-sm bg-white px-2 py-1 rounded">
              /files/view{'{-$filename}.{-$ext}'}
            </code>
            <p className="text-sm text-gray-600 mt-2">
              File viewing with prefix/suffix optional parameters
            </p>
          </div>

          <div className="bg-indigo-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">API Documentation</h3>
            <code className="text-sm bg-white px-2 py-1 rounded">
              /api/v{'{-$version}/{-$endpoint}'}
            </code>
            <p className="text-sm text-gray-600 mt-2">
              API docs with optional version and endpoint parameters
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4">Key Features Tested</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Single optional parameters (/blog/{'{-$category}'})</li>
          <li>
            Mixed required and optional parameters (/users/$id/{'{-$tab}'})
          </li>
          <li>
            Optional parameters with prefix patterns (/api/v
            {'{-$version}/{-$endpoint}'})
          </li>
          <li>Parameter inheritance between routes</li>
          <li>TypeScript type safety in Start + Router</li>
          <li>Server-side rendering (SSR) compatibility</li>
          <li>File-based routing with optional parameters</li>
          <li>Link generation and navigation</li>
          <li>Direct URL access</li>
        </ul>
      </div>
    </div>
  )
}
