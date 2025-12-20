/**
 * Test: Import from a module that re-exports.
 *
 * This route imports from public-api.ts, which re-exports
 * isomorphic functions from shared.ts.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

// Import from the re-export module
import {
  getEnv, // renamed re-export
  getServerEnvironment,
  formatMessage,
  getAllUsers,
  APP_NAME,
} from '../utils/public-api'

export const Route = createFileRoute('/reexport-import')({
  component: ReexportImportTest,
  loader: async () => {
    const envOnLoad = getEnv()
    const users = await getAllUsers()
    return { envOnLoad, users }
  },
})

function ReexportImportTest() {
  const { envOnLoad, users } = Route.useLoaderData()
  const [results, setResults] = useState<{
    envOnClick?: string
    messageOnClick?: string
    serverEnv?: string
  } | null>(null)

  async function handleClick() {
    const envOnClick = getEnv()
    const messageOnClick = formatMessage('Re-export test')
    const serverEnv = await getServerEnvironment()
    setResults({ envOnClick, messageOnClick, serverEnv })
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Re-export Import Test</h1>
      <p className="mb-4">
        Testing imports from a module that re-exports isomorphic functions.
      </p>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">App Name:</h2>
        <pre data-testid="app-name">{APP_NAME}</pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">SSR Results:</h2>
        <div>
          Environment on load:
          <pre data-testid="ssr-env">{JSON.stringify(envOnLoad)}</pre>
        </div>
        <div>
          All users from server:
          <pre data-testid="ssr-users">{JSON.stringify(users)}</pre>
        </div>
      </div>

      <button
        onClick={handleClick}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
        data-testid="run-client-tests-btn"
      >
        Run Client Tests
      </button>

      {results && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Client Results:</h2>
          <div>
            Environment on click:
            <pre data-testid="client-env">
              {JSON.stringify(results.envOnClick)}
            </pre>
          </div>
          <div>
            Message formatted:
            <pre data-testid="client-message">
              {JSON.stringify(results.messageOnClick)}
            </pre>
          </div>
          <div>
            Server environment:
            <pre data-testid="server-env">
              {JSON.stringify(results.serverEnv)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
