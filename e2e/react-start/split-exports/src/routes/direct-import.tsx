/**
 * Test: Direct import from a module with mixed exports.
 *
 * This route imports isomorphic functions directly from shared.ts,
 * which also exports server-only code that should NOT be bundled.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

// Direct import - only importing the isomorphic exports
// Server-only exports (getServerOnlyDatabase, getServerOnlyUserData, serverOnlyConfig)
// should be eliminated from the client bundle by the split-exports plugin
import {
  getEnvironment,
  getServerEnvironment,
  formatMessage,
  getUserById,
  formatUserName,
  APP_NAME,
} from '../utils/shared'

export const Route = createFileRoute('/direct-import')({
  component: DirectImportTest,
  loader: async () => {
    // Call isomorphic function during SSR - should return 'server'
    const envOnLoad = getEnvironment()
    // Call server function during SSR
    const user = await getUserById({ data: '1' })
    return { envOnLoad, user }
  },
})

function DirectImportTest() {
  const { envOnLoad, user } = Route.useLoaderData()
  const [results, setResults] = useState<{
    envOnClick?: string
    messageOnClick?: string
    serverEnv?: string
    serverUser?: { id: string; name: string; email: string }
  } | null>(null)

  async function handleClick() {
    // Call isomorphic function on client - should return 'client'
    const envOnClick = getEnvironment()
    // Call isomorphic function on client
    const messageOnClick = formatMessage('Hello World')
    // Call server functions from client
    const [serverEnv, serverUser] = await Promise.all([
      getServerEnvironment(),
      getUserById({ data: '2' }),
    ])
    setResults({ envOnClick, messageOnClick, serverEnv, serverUser })
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Direct Import Test</h1>
      <p className="mb-4">
        Testing direct imports from a module with mixed server-only and
        isomorphic exports.
      </p>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">App Name (constant):</h2>
        <pre data-testid="app-name">{APP_NAME}</pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          Format User Name (pure function):
        </h2>
        <pre data-testid="formatted-name">{formatUserName('John', 'Doe')}</pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">SSR Results:</h2>
        <div>
          Environment on load (should be "server"):
          <pre data-testid="ssr-env">{JSON.stringify(envOnLoad)}</pre>
        </div>
        <div>
          User loaded during SSR:
          <pre data-testid="ssr-user">{JSON.stringify(user)}</pre>
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
            Environment on click (should be "client"):
            <pre data-testid="client-env">
              {JSON.stringify(results.envOnClick)}
            </pre>
          </div>
          <div>
            Message formatted on client:
            <pre data-testid="client-message">
              {JSON.stringify(results.messageOnClick)}
            </pre>
          </div>
          <div>
            Server environment (via server function):
            <pre data-testid="server-env">
              {JSON.stringify(results.serverEnv)}
            </pre>
          </div>
          <div>
            User from server function:
            <pre data-testid="server-user">
              {JSON.stringify(results.serverUser)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
