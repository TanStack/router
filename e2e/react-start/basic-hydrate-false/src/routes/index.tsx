import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold mb-6">
        TanStack Router - Hydrate Feature Demo
      </h1>

      <div className="mb-8">
        <p className="text-lg mb-4">
          This demo showcases the new <code className="bg-gray-100 px-2 py-1 rounded">hydrate</code> option
          for TanStack Start routes.
        </p>
        <p className="mb-4">
          The <code className="bg-gray-100 px-2 py-1 rounded">hydrate: false</code> option allows you to
          render pages that are server-side rendered but do not include the React hydration bundle.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          to="/hydrated"
          className="block p-6 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 transition"
        >
          <h2 className="text-2xl font-bold mb-2 text-blue-900">
            ✅ Hydrated Route
          </h2>
          <p className="text-gray-700">
            A normal React route with full interactivity. Includes the React bundle and hydration.
          </p>
        </Link>

        <Link
          to="/static"
          className="block p-6 bg-purple-50 border-2 border-purple-200 rounded-lg hover:bg-purple-100 transition"
        >
          <h2 className="text-2xl font-bold mb-2 text-purple-900">
            🚫 Static Route (hydrate: false)
          </h2>
          <p className="text-gray-700">
            A server-rendered static page. No React bundle, no hydration, no interactivity.
          </p>
        </Link>
      </div>

      <div className="mt-8 p-6 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
        <h3 className="text-xl font-bold mb-2">💡 Use Cases</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>Marketing/landing pages that don't need interactivity</li>
          <li>Legal pages (Terms, Privacy Policy)</li>
          <li>Blog posts or documentation</li>
          <li>SEO-focused content pages</li>
          <li>Reducing JavaScript bundle size for static content</li>
        </ul>
      </div>
    </div>
  )
}
