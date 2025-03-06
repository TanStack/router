import { Link, createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // Log for debugging
    console.log('Checking context on index.tsx:', context) // Check if user is authenticated
    if (context.auth.isAuthenticated) {
      console.log('User authenticated, proceeding...')
      throw redirect({
        to: '/dashboard',
      })
    }
  },
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Welcome to TS Router + Firebase
      </h1>

      <section className="mb-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">About This Template</h2>
        <p className="mb-2">
          This template demonstrates a SPA architecture using:
        </p>
        <ul className="list-disc list-inside mb-4">
          <li>TanStack Router for type-safe routing</li>
          <li>Firebase Client SDK for authentication</li>
        </ul>
        <p>
          <strong>Project Organization:</strong> Routes under <code>_auth</code>{' '}
          are protected, while other routes are public. The{' '}
          <code>(public)</code> folder is used purely for organization and
          doesn't affect routing.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">How It Works</h2>
        <p className="mb-3">
          This page (<code>index.tsx</code>) serves as your public landing/sales
          page. When an authenticated user visits this route, they're
          automatically redirected to <code>/dashboard</code>.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold mb-2">Navigation</h2>
        <div className="flex gap-4">
          <Link
            to="/login"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Login
          </Link>
          <Link
            to="/dashboard"
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Dashboard (Protected)
          </Link>
        </div>
      </section>
    </div>
  )
}
