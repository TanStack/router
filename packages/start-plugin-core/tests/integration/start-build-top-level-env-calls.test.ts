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
    'an implementation in a type wrapper, called in place, runs in its environment',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/seen.ts': seen,
          'src/iso-server.ts': `${reads('MARK_ISO_SERVER')}function impl() { use(label) }
createIsomorphicFn().server(impl as any)()
`,
          'src/iso-client.ts': `${reads('MARK_ISO_CLIENT')}function impl() { use(label) }
createIsomorphicFn().client(impl satisfies () => void)()
`,
          'src/iso-both.ts': `${reads('MARK_ISO_BOTH_SERVER')}const other = 'MARK_ISO_BOTH_CLIENT'
function impl() { use(label) }
function clientImpl() { use(other) }
const value = createIsomorphicFn().server(impl as any).client(clientImpl as any)()
export { value }
`,
          'src/server-only.ts': `${reads('MARK_SERVER_ONLY', 'createServerOnlyFn')}function impl() { use(label) }
// (the client's stub throws)
if (typeof window === 'undefined') createServerOnlyFn(impl as any)()
`,
          'src/client-only.ts': `${reads('MARK_CLIENT_ONLY', 'createClientOnlyFn')}function impl() { use(label) }
// (the server's stub throws)
if (typeof window !== 'undefined') createClientOnlyFn(impl as any)()
`,
          'src/statement.ts': `${reads('MARK_STATEMENT', 'createServerOnlyFn')}createServerOnlyFn(function () { use(label) } as any)
`,
          'entry.ts': `import './src/iso-server'
import './src/iso-client'
import './src/iso-both'
import './src/server-only'
import './src/client-only'
import './src/statement'
export { seen } from './src/seen'
`,
        },
      })
      expect((await ssr.run(`return entry.seen`)).result).toEqual([
        'MARK_ISO_SERVER',
        'MARK_ISO_BOTH_SERVER',
        'MARK_SERVER_ONLY',
      ])
      expect((await client.run(`return entry.seen`)).result).toEqual([
        'MARK_ISO_CLIENT',
        'MARK_ISO_BOTH_CLIENT',
        'MARK_CLIENT_ONLY',
      ])
      for (const marker of [
        'MARK_ISO_SERVER',
        'MARK_ISO_BOTH_SERVER',
        'MARK_SERVER_ONLY',
        'MARK_STATEMENT',
      ]) {
        expect(client.where(marker), marker).toBe('nowhere')
      }
    },
    timeout,
  )

  // the server keeps the implementation as the statement: an async
  // function expression, with a comment or a long run of spaces between
  // `async` and `function`, written as a statement in parentheses (it is no
  // declaration); the control without trivia. Source: Astra review 3
  // (core B4)
  test(
    'a server-only fn written as a statement, its implementation an async function expression with trivia after `async`: both builds run',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/seen.ts': seen,
          'src/comment.ts': `${reads('MARK_ASYNC_COMMENT', 'createServerOnlyFn')}createServerOnlyFn(async /* posted */ function () { use(label) })
export const comment = 'comment'
`,
          'src/spaces.ts': `${reads('MARK_ASYNC_SPACES', 'createServerOnlyFn')}createServerOnlyFn(async                function () { use(label) })
export const spaces = 'spaces'
`,
          'src/plain.ts': `${reads('MARK_ASYNC_PLAIN', 'createServerOnlyFn')}createServerOnlyFn(async function () { use(label) })
export const plain = 'plain'
`,
          'entry.ts': `export { comment } from './src/comment'
export { spaces } from './src/spaces'
export { plain } from './src/plain'
export { seen } from './src/seen'
`,
        },
      })
      const run = `return [entry.comment, entry.spaces, entry.plain, entry.seen]`
      const expected = ['comment', 'spaces', 'plain', []]
      expect((await ssr.run(run)).result).toEqual(expected)
      expect((await client.run(run)).result).toEqual(expected)
      for (const marker of [
        'MARK_ASYNC_COMMENT',
        'MARK_ASYNC_SPACES',
        'MARK_ASYNC_PLAIN',
      ]) {
        expect(client.where(marker), marker).toBe('nowhere')
      }
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
