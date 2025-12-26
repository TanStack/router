import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/test-head/dashboard')({
  head: () => ({
    meta: [{ title: 'Dashboard' }],
  }),
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div class="p-4" data-testid="dashboard">
      <h1 class="text-2xl font-bold" data-testid="dashboard-title">
        Dashboard
      </h1>

      <div class="mt-8 p-4 bg-blue-100 border border-blue-400 rounded">
        <h2 class="font-bold text-lg">🧪 Now Test the Bug:</h2>
        <p class="mt-2">
          Click your browser's <strong>BACK button</strong> (or press Alt+←)
        </p>

        <div class="mt-4 p-3 bg-white rounded">
          <p class="font-semibold">What to observe:</p>
          <ul class="mt-2 space-y-2 text-sm">
            <li>
              🔍 <strong>Browser tab title</strong> - Should update from stale
              to correct title
            </li>
            <li>
              🔍 <strong>Article content</strong> - Should load correctly
            </li>
          </ul>

          <div class="mt-3 p-2 bg-gray-100 rounded text-xs font-mono">
            <div class="text-green-600">✅ WITH NON-BLOCKING FIX:</div>
            <div>1. Initial head() runs (may show stale title)</div>
            <div>2. Async loaders complete in background</div>
            <div>3. All head() functions re-execute (correct title!)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
