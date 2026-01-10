import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/static')({
  // This is the key: hydrate: false means no React hydration
  hydrate: false,
  loader: () => {
    return {
      serverTime: new Date().toISOString(),
      message: 'This data was loaded on the server',
      pageViews: Math.floor(Math.random() * 10000),
    }
  },
  head: () => ({
    meta: [
      {
        title: 'Static Route - TanStack Router Demo',
      },
      {
        name: 'description',
        content: 'A static server-rendered page with no hydration',
      },
    ],
    // You can still include external scripts that don't require React
    scripts: [
      {
        children: `
          console.log('✅ External scripts still work!');
          console.log('This page has no React hydration');
        `,
      },
    ],
  }),
  component: StaticComponent,
})

function StaticComponent() {
  const data = Route.useLoaderData()

  return (
    <div className="max-w-4xl mx-auto p-8">
      <a
        href="/"
        className="text-purple-600 hover:underline mb-4 inline-block"
        data-testid="back-link"
      >
        ← Back to Home
      </a>

      <h1 className="text-4xl font-bold mb-6" data-testid="static-heading">
        🚫 Static Route (hydrate: false)
      </h1>

      <div className="space-y-6">
        <div className="p-6 bg-purple-50 border-2 border-purple-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">🎯 What This Means</h2>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✅</span>
              <span>Page is server-side rendered</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✅</span>
              <span>All content is SEO-friendly</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✅</span>
              <span>Fast initial page load (no JS bundle)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 font-bold">❌</span>
              <span>No React interactivity</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 font-bold">❌</span>
              <span>No useState, useEffect, or event handlers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 font-bold">❌</span>
              <span>Links are traditional navigation (full page reload)</span>
            </li>
          </ul>
        </div>

        <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">📦 Server Data</h2>
          <div className="space-y-2">
            <p data-testid="server-time">
              <span className="font-semibold">Server Time:</span>{' '}
              <code className="bg-gray-100 px-2 py-1 rounded">
                {data.serverTime}
              </code>
            </p>
            <p data-testid="message">
              <span className="font-semibold">Message:</span> {data.message}
            </p>
            <p data-testid="page-views">
              <span className="font-semibold">Page Views:</span>{' '}
              {data.pageViews.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="p-6 bg-red-50 border-2 border-red-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">
            ⚠️ Try Clicking This Button
          </h2>
          <p className="mb-4">
            This button has an onClick handler, but it won't work because React
            is not hydrated:
          </p>
          <button
            onClick={() => alert('This will NOT work!')}
            className="px-6 py-3 bg-gray-300 text-gray-600 rounded cursor-not-allowed"
            data-testid="inactive-button"
          >
            Inactive Button (onClick won't fire)
          </button>
          <p className="mt-2 text-sm text-gray-600">
            Nothing happens when you click because there's no JavaScript event
            handler attached.
          </p>
        </div>

        <div className="p-6 bg-gray-50 border-2 border-gray-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">🔍 What's NOT Included</h2>
          <p className="mb-2">Open DevTools → Network → JS. You'll see:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li className="line-through text-gray-400">
              React runtime bundle (NOT loaded)
            </li>
            <li className="line-through text-gray-400">
              React DOM bundle (NOT loaded)
            </li>
            <li className="line-through text-gray-400">
              TanStack Router client bundle (NOT loaded)
            </li>
            <li className="line-through text-gray-400">
              Your application code (NOT loaded)
            </li>
            <li className="line-through text-gray-400">
              Hydration data (NOT included)
            </li>
          </ul>
          <p className="mt-4 text-sm font-semibold text-green-700">
            ✅ Result: Significantly smaller page size and faster initial load!
          </p>
        </div>

        <div className="p-6 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">💡 Perfect For:</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Terms of Service / Privacy Policy pages</li>
            <li>Blog posts and articles</li>
            <li>Marketing landing pages</li>
            <li>Documentation</li>
            <li>Any content that doesn't need interactivity</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
