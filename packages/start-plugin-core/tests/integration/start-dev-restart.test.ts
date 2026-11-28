/**
 * A dev server restart (`rsbuild dev` or `vite dev` run again in the same
 * process, as on a config edit: new Start plugin instances) sees the app's
 * files as they are now. Start's entry lookup is shared by both hosts
 * (`resolveStartEntryPlan`); Rsbuild's harness restarts with new plugin
 * instances.
 */
import { pluginReact } from '@rsbuild/plugin-react'
import { expect, test } from 'vitest'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile, startPageEntries } from './start-compose-app'

const timeout = 60_000

// Start looks up its optional entries (`src/start.ts`, `src/client.tsx`,
// `src/server.ts`) once per plugin instance. The lookup's cache was
// process-wide and kept misses, so a restart did not see an entry created
// since.
test(
  'after a dev server restart, a start entry created since is used',
  async () => {
    const server = await startRsbuildStartDevServer({
      browser: true,
      hmr: false,
      config: { plugins: [pluginReact()] },
      files: {
        ...startPageEntries,
        'src/ssr-entry.ts': `export {}\n`,
        'src/client-entry.ts': `export {}\n`,
        'src/router.ts': routerFile,
        'src/routes/__root.tsx': rootDocument(),
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>index</p> })
`,
      },
    })
    const header = async (url: string) =>
      (await fetch(new URL('/', url))).headers.get('x-start')
    expect(await header(server.url!)).toBeNull()

    await server.edit(
      {
        'src/start.ts': `import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
const mark = createMiddleware().server(({ next }) => {
  setResponseHeader('x-start', 'MARK_START')
  return next()
})
export const startInstance = createStart(() => ({ requestMiddleware: [mark] }))
`,
      },
      // (nothing imports it before the restart)
      { accept: (file) => file === 'src/start.ts' },
    )
    const restarted = await server.restart()
    expect(await header(restarted.url!)).toBe('MARK_START')
  },
  timeout,
)
