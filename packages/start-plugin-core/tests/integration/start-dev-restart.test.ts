/**
 * A Vite dev server restart (`r` in the terminal, or an edit of the Vite
 * config) loads the app's Vite config again, with new Start plugin
 * instances: they see the app's files as they are now.
 */
import path from 'node:path'
import { createServer } from 'vite'
import { expect, onTestFinished, test } from 'vitest'
import { appFiles, createStartApp } from './start-app'

const timeout = 60_000

// Start looks up its optional entries (`src/start.ts`, `src/client.tsx`,
// `src/server.ts`) once per plugin instance. The lookup's cache was
// process-wide and kept misses, so a restart did not see an entry created
// since.
test(
  'after a dev server restart, a start entry created since is used',
  async () => {
    const app = await createStartApp(
      appFiles({
        'vite.config.ts': `import { tanstackStart } from '@tanstack/react-start/plugin/vite'
export default { plugins: [tanstackStart()] }
`,
      }),
    )
    // (listening, as `vite dev`: Start leaves its request handler out in
    // middleware mode)
    const server = await createServer({
      root: app.root,
      configFile: path.join(app.root, 'vite.config.ts'),
      logLevel: 'error',
      server: { port: 0 },
    })
    onTestFinished(() => server.close())
    await server.listen()
    const page = () => fetch(server.resolvedUrls!.local[0]!)
    expect((await page()).headers.get('x-start')).toBeNull()

    await app.write({
      'src/start.ts': `import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
const mark = createMiddleware().server(({ next }) => {
  setResponseHeader('x-start', 'MARK_START')
  return next()
})
export const startInstance = createStart(() => ({ requestMiddleware: [mark] }))
`,
    })
    await server.restart()
    expect((await page()).headers.get('x-start')).toBe('MARK_START')
  },
  timeout,
)
