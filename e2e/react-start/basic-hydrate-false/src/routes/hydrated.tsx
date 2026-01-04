import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/hydrated')({
  // Default is hydrate: true, so this is a normal React route
  loader: () => {
    return {
      serverTime: new Date().toISOString(),
      message: 'This data was loaded on the server',
    }
  },
  head: () => ({
    meta: [
      {
        title: 'Hydrated Route - TanStack Router Demo',
      },
      {
        name: 'description',
        content: 'A fully interactive React page with hydration',
      },
    ],
  }),
  component: HydratedComponent,
})

function HydratedComponent() {
  const data = Route.useLoaderData()
  const [count, setCount] = React.useState(0)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">
        ← Back to Home
      </Link>

      <h1 className="text-4xl font-bold mb-6">✅ Hydrated Route</h1>

      <div className="space-y-6">
        <div className="p-6 bg-green-50 border-2 border-green-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">✨ Interactive Features</h2>

          <div className="mb-4">
            <p className="mb-2 font-semibold">Counter (React State):</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCount(count - 1)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                -
              </button>
              <span className="text-3xl font-bold" data-testid="counter">
                {count}
              </span>
              <button
                onClick={() => setCount(count + 1)}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 font-semibold">Hydration Status:</p>
            <div
              data-testid="hydration-status"
              className={`px-4 py-2 rounded font-bold ${
                mounted
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {mounted ? '✅ Hydrated and Interactive' : '⏳ Server-Rendered'}
            </div>
          </div>
        </div>

        <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">📦 Server Data</h2>
          <div className="space-y-2">
            <p>
              <span className="font-semibold">Server Time:</span>{' '}
              <code className="bg-gray-100 px-2 py-1 rounded">
                {data.serverTime}
              </code>
            </p>
            <p>
              <span className="font-semibold">Message:</span> {data.message}
            </p>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-2 border-gray-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">🔍 What's Included</h2>
          <p className="mb-2">
            Open DevTools → Network → JS to see the loaded bundles:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>React runtime bundle</li>
            <li>React DOM bundle</li>
            <li>TanStack Router bundle</li>
            <li>Your application code</li>
            <li>Hydration data (window.$_TSR)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
