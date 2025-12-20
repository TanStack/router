import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4" data-testid="home-title">
        Split Exports Plugin E2E Tests
      </h1>
      <p className="mb-4">
        This e2e test verifies that the split-exports plugin correctly handles
        modules that export both server-only and isomorphic code.
      </p>
      <h2 className="text-xl font-semibold mb-2">Test Scenarios:</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Direct Import:</strong> Import isomorphic functions directly
          from a module that also exports server-only code
        </li>
        <li>
          <strong>Re-export Import:</strong> Import from a module that
          re-exports isomorphic functions from another module
        </li>
        <li>
          <strong>Nested Import:</strong> Import from a module that internally
          uses server-only code but only exposes isomorphic functions
        </li>
        <li>
          <strong>Alias Import:</strong> Import using TypeScript path aliases
          (~/utils/...)
        </li>
      </ul>
    </div>
  )
}
