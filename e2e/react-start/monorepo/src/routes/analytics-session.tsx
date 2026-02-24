import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { getAnalyticsSession } from '@repo/analytics'

export const Route = createFileRoute('/analytics-session')({
  component: AnalyticsSessionComponent,
  loader: () => getAnalyticsSession(),
})

function AnalyticsSessionComponent() {
  const data = Route.useLoaderData()

  return (
    <div className="p-8">
      <h1 className="font-bold text-lg mb-4">Analytics Session</h1>
      <p className="text-gray-600 mb-4">
        This route calls getAnalyticsSession() from @repo/analytics. The server
        function uses a local middleware created via
        startInstance.createMiddleware(), which extends the global request
        context with a sessionId — all without needing routeTree.gen.ts.
      </p>
      <div className="space-y-2">
        <div>
          Locale: <span data-testid="locale">{data.locale}</span>
        </div>
        <div>
          User ID: <span data-testid="userId">{data.userId}</span>
        </div>
        <div>
          Session ID: <span data-testid="sessionId">{data.sessionId}</span>
        </div>
      </div>
    </div>
  )
}
