/**
 * Test: Import using TypeScript path aliases.
 *
 * This route uses the ~/ alias to import modules.
 * Tests that the split-exports plugin correctly handles aliased imports.
 *
 * This test also covers the nested import scenario - importing from nested.ts
 * which internally uses server-only code but only exposes isomorphic functions.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

// Import using path alias from shared.ts
import {
  getEnvironment,
  getServerEnvironment,
  getUserById,
  formatUserName,
  APP_NAME,
} from '~/utils/shared'

// Import from nested module using path alias
// This tests the nested import scenario where nested.ts internally uses
// server-only code (getServerOnlyUserData) but only exposes isomorphic functions
import {
  fetchUserProfile,
  computeGreeting,
  getServerGreeting,
  GREETING_PREFIX,
} from '~/utils/nested'

export const Route = createFileRoute('/alias-import')({
  component: AliasImportTest,
  loader: async () => {
    const envOnLoad = getEnvironment()
    const greetingOnLoad = computeGreeting('SSR via Alias')
    const user = await getUserById({ data: '100' })
    // Test fetchUserProfile from nested.ts (uses server-only code internally)
    const profile = await fetchUserProfile({ data: '42' })
    return { envOnLoad, greetingOnLoad, user, profile }
  },
})

function AliasImportTest() {
  const { envOnLoad, greetingOnLoad, user, profile } = Route.useLoaderData()
  const [results, setResults] = useState<{
    envOnClick?: string
    greetingOnClick?: string
    serverEnv?: string
    serverGreeting?: string
    serverProfile?: {
      id: string
      displayName: string
      contact: string
      appName: string
    }
  } | null>(null)

  async function handleClick() {
    const envOnClick = getEnvironment()
    const greetingOnClick = computeGreeting('Client via Alias')
    const [serverEnv, serverGreeting, serverProfile] = await Promise.all([
      getServerEnvironment(),
      getServerGreeting({ data: 'Server via Alias' }),
      fetchUserProfile({ data: '99' }),
    ])
    setResults({
      envOnClick,
      greetingOnClick,
      serverEnv,
      serverGreeting,
      serverProfile,
    })
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Alias Import Test</h1>
      <p className="mb-4">
        Testing imports using TypeScript path aliases (~/utils/...). Also tests
        nested imports where the module internally uses server-only code.
      </p>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          Constants (from aliased imports):
        </h2>
        <div>
          App Name: <pre data-testid="app-name">{APP_NAME}</pre>
        </div>
        <div>
          Greeting Prefix:{' '}
          <pre data-testid="greeting-prefix">{GREETING_PREFIX}</pre>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          Format User Name (pure function):
        </h2>
        <pre data-testid="formatted-name">
          {formatUserName('Jane', 'Smith')}
        </pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">SSR Results:</h2>
        <div>
          Environment on load:
          <pre data-testid="ssr-env">{JSON.stringify(envOnLoad)}</pre>
        </div>
        <div>
          Greeting on load:
          <pre data-testid="ssr-greeting">{JSON.stringify(greetingOnLoad)}</pre>
        </div>
        <div>
          User from server:
          <pre data-testid="ssr-user">{JSON.stringify(user)}</pre>
        </div>
        <div>
          Profile from nested module (uses server-only code internally):
          <pre data-testid="ssr-profile">{JSON.stringify(profile)}</pre>
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
            Greeting on click:
            <pre data-testid="client-greeting">
              {JSON.stringify(results.greetingOnClick)}
            </pre>
          </div>
          <div>
            Server environment:
            <pre data-testid="server-env">
              {JSON.stringify(results.serverEnv)}
            </pre>
          </div>
          <div>
            Server greeting:
            <pre data-testid="server-greeting">
              {JSON.stringify(results.serverGreeting)}
            </pre>
          </div>
          <div>
            Server profile (from nested module):
            <pre data-testid="server-profile">
              {JSON.stringify(results.serverProfile)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
