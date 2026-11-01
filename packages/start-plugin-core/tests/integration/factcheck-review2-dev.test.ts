/**
 * Fact-check of external review 2 (claims 6 and 7), on running dev servers.
 * Each pin asserts the correct behaviour and fails on the current compiler.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'

const timeout = 60_000

const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`
const builder = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const importer = `import { base } from '#lib'
export const fn = base.handler(async () => 'MARK_HANDLER')
`
const packageJson = (target: string) =>
  JSON.stringify({ private: true, type: 'module', imports: { '#lib': target } })

describe('claim 6: a package.json `imports` edit', () => {
  const app = {
    'package.json': packageJson('./src/lib/plain.ts'),
    'src/lib/plain.ts': plain,
    'src/lib/builder.ts': builder,
    'src/a.ts': importer,
  }

  // Vite follows the edit at once (the served module imports the new target);
  // the compiler's resolution memo holds the old target until a file appears
  // or disappears, so the handler stays on the client. Main strips it.
  test.fails(
    'Vite: the next compile of an importer follows the new target',
    async () => {
      const server = await startDevServer({ files: app })
      expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
      await server.edit({ 'package.json': packageJson('./src/lib/builder.ts') })
      await server.edit({ 'src/a.ts': `${importer}// edited\n` })
      expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
    },
    timeout,
  )

  // Rspack bundles the new target; the memo holds the old one (nor does a
  // file outside the graph move it: Rspack only reports its dependencies).
  test.fails(
    'Rsbuild: the next compile of an importer follows the new target',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout: 20_000,
        files: {
          ...app,
          'src/entry.ts': `import { fn } from './a'\n;(globalThis as any).fn = fn\n`,
        },
      })
      const output = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(await output()).toContain('MARK_HANDLER')
      await server.edit({ 'package.json': packageJson('./src/lib/builder.ts') })
      await server.edit({ 'src/a.ts': `${importer}// edited\n` })
      expect(await output()).not.toContain('MARK_HANDLER')
    },
    timeout,
  )
})

describe('claim 7: a registry change with a resolver that throws', () => {
  // `void invalidateRegistry(file)` has no catch and the invalidation asks the
  // resolver (after a file event emptied its memo): an unhandled rejection,
  // which ends a `vite dev` process (exit code 1). Main gets a 500 for the
  // request that hits the same resolver and keeps running.
  test.fails(
    'Vite: the dev server survives it',
    async () => {
      // the test runner fails a run on any unhandled rejection: only this
      // test's listener hears them, as the process would
      const runner = process.listeners('unhandledRejection')
      const rejections: Array<unknown> = []
      process.removeAllListeners('unhandledRejection')
      process.on('unhandledRejection', (reason) => {
        rejections.push(reason)
      })
      onTestFinished(() => {
        process.removeAllListeners('unhandledRejection')
        for (const listener of runner) {
          process.on('unhandledRejection', listener)
        }
      })
      let failing = false
      const server = await startDevServer({
        plugins: [
          {
            name: 'user-resolver',
            enforce: 'pre',
            resolveId(source: string) {
              if (failing && source === './routes/a') {
                throw new Error('MARK_RESOLVER_FAILED')
              }
              return null
            },
          },
        ],
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
          'src/routes/a.tsx': `export const value = 1\n`,
          'src/helper.ts': `import { createServerFn } from '@tanstack/react-start'
import { value } from './routes/a'
export const fn = createServerFn().handler(async () => value)
`,
        },
      })
      await server.transform('/src/helper.ts')
      // the file set moves: the resolver's answers are asked for again
      await server.edit({ 'src/other.ts': `export const other = 1\n` })
      failing = true
      // a file with no `Route` export becomes a route: its registry entry changes
      await server.edit({
        'src/routes/a.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const value = 1
export const Route = createFileRoute('/a')({})
`,
      })
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      expect(rejections).toEqual([])
    },
    timeout,
  )
})
