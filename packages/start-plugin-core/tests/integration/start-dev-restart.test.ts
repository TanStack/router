/**
 * A Vite dev server restart (`r` in the terminal, or an edit of the Vite
 * config) resolves the app's config again: Start's plugins see the app's
 * files as they are now.
 */
import { expect, test } from 'vitest'
import { startDevServer, startRequestFiles } from '../dev-server'

const timeout = 60_000

// Start looks up its optional entries (`src/start.ts`, `src/client.tsx`,
// `src/server.ts`) when the config is resolved. The lookup's cache was
// process-wide and kept misses, so a restart did not see an entry created
// since.
test(
  'after a dev server restart, a start entry created since is used',
  async () => {
    const server = await startDevServer({ files: startRequestFiles })
    /** The `x-start` header of the app's answer to `/`. */
    const header = async () => {
      // The app's server entry (`startRequestFiles`): Start's HTTP handler.
      const { default: handler } = await server.import(
        '/harness/server-entry.ts',
      )
      const response: Response = await handler.fetch(
        new Request('http://localhost/'),
      )
      return response.headers.get('x-start')
    }
    expect(await header()).toBeNull()

    await server.edit({
      'src/start.ts': `import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
const mark = createMiddleware().server(({ next }) => {
  setResponseHeader('x-start', 'MARK_START')
  return next()
})
export const startInstance = createStart(() => ({ requestMiddleware: [mark] }))
`,
    })
    await server.vite.restart()
    expect(await header()).toBe('MARK_START')
  },
  timeout,
)
