/**
 * Isomorphic and env-only fns called where they are written, as a statement
 * of the module (`createIsomorphicFn().server(() => { use(label) })()`), in
 * real builds whose output runs: the side the implementation is for runs it
 * with everything it reads, at module load, and the other side's build holds
 * none of it. SPEC J4.9, G8.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

const seen = `export const seen: Array<string> = []
export const note = (value: string) => {
  seen.push(value)
}
`
/** A module's start: the reads of its implementations are pure bindings of the module, and an import. */
const reads = (
  marker: string,
  factory = 'createIsomorphicFn',
) => `import { ${factory} } from '@tanstack/react-start'
import { note } from './seen'
const label = '${marker}'
function use(value: string) {
  note(value)
}
`

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'an isomorphic fn called as a statement runs its implementation with what it reads',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/seen.ts': seen,
          'src/iso-server.ts': `${reads('MARK_SERVER')}createIsomorphicFn().server(() => { use(label) })()\n`,
          'src/iso-client.ts': `${reads('MARK_CLIENT')}createIsomorphicFn().client(() => { use(label) })()\n`,
          'src/iso-both.ts': `${reads('MARK_BOTH_SERVER')}const other = 'MARK_BOTH_CLIENT'
createIsomorphicFn().server(() => { use(label) }).client(() => { use(other) })();
`,
          'src/iso-named.ts': `${reads('MARK_NAMED')}function impl() { use(label) }
createIsomorphicFn().server(impl)()
`,
          'entry.ts': `import './src/iso-server'
import './src/iso-client'
import './src/iso-both'
import './src/iso-named'
export { seen } from './src/seen'
`,
        },
      })
      expect((await ssr.run(`return entry.seen`)).result).toEqual([
        'MARK_SERVER',
        'MARK_BOTH_SERVER',
        'MARK_NAMED',
      ])
      expect((await client.run(`return entry.seen`)).result).toEqual([
        'MARK_CLIENT',
        'MARK_BOTH_CLIENT',
      ])
      for (const marker of ['MARK_SERVER', 'MARK_BOTH_SERVER', 'MARK_NAMED']) {
        expect(client.where(marker), marker).toBe('nowhere')
      }
      for (const marker of ['MARK_CLIENT', 'MARK_BOTH_CLIENT']) {
        expect(ssr.where(marker), marker).toBe('nowhere')
      }
    },
    timeout,
  )

  test(
    'a server-only fn called as a statement runs on the server with what it reads, and only its stub reaches the client',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/seen.ts': seen,
          'entry.ts':
            `${reads('MARK_ONLY', 'createServerOnlyFn')}createServerOnlyFn(() => { use(label) })()
export { seen } from './seen'
`.replaceAll('./seen', './src/seen'),
        },
      })
      expect((await ssr.run(`return entry.seen`)).result).toEqual(['MARK_ONLY'])
      expect(client.where('MARK_ONLY')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'a route file with one: the page renders, and its server code stays out of the client',
    async () => {
      const cleanups: Array<() => Promise<void>> = []
      onTestFinished(async () => {
        for (const cleanup of cleanups.reverse()) {
          await cleanup()
        }
      })
      const registerCleanup = (cleanup: () => Promise<void>) => {
        cleanups.push(cleanup)
      }
      const build = await buildStart({
        bundler,
        files: {
          ...startPageEntries,
          ...pageEntries,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
const label = 'MARK_ROUTE_LABEL'
createIsomorphicFn().server(() => { (globalThis as Record<string, unknown>).routeLabel = label })()
export const Route = createFileRoute('/')({ component: () => <p data-testid="shown">shown</p> })
`,
        },
        registerCleanup,
      })
      const served = await serveStartBuild(build, { registerCleanup })
      const page = await openAppPage(served, '/', { registerCleanup })
      await page.waitForText('shown', { selector: '[data-testid=shown]' })
      expect(page.errors).toEqual([])
      expect(build.client.where('MARK_ROUTE_LABEL')).toBe('nowhere')
      expect(build.ssr.where('MARK_ROUTE_LABEL')).not.toBe('nowhere')
    },
    timeout,
  )
})
