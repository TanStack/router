import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { getAnalyticsContext } from '@repo/analytics'

export const Route = createFileRoute('/analytics-context')({
  component: AnalyticsContextComponent,
  loader: () => getAnalyticsContext(),
})

function AnalyticsContextComponent() {
  const data = Route.useLoaderData()

  return (
    <div className="p-8">
      <h1 className="font-bold text-lg mb-4">Analytics Context</h1>
      <p className="text-gray-600 mb-4">
        This route calls getAnalyticsContext() from @repo/analytics. The server
        function was created via startInstance.createServerFn() and
        automatically receives context from global request middleware (locale,
        userId) without needing access to routeTree.gen.ts.
      </p>
      <div className="space-y-2">
        <div>
          Locale: <span data-testid="locale">{data.locale}</span>
        </div>
        <div>
          User ID: <span data-testid="userId">{data.userId}</span>
        </div>
      </div>
    </div>
  )
}
