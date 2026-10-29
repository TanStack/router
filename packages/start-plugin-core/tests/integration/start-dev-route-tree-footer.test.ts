/**
 * Start's route tree footer in development, the same on both bundlers: a
 * function-form `router.routeTreeFileFooter` gives its lines at every print
 * of the route tree, after Start's register block, as a router app's own
 * footer function does (Start's Vite plugin printed its first result for the
 * whole session).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'

const timeout = 60_000

/** Waits for `check`, bounded: a correct generator prints within a second. */
async function until(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + 20_000
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe.each(['vite', 'rsbuild'] as const)('%s dev', (bundler) => {
  test(
    'a function-form routeTreeFileFooter gives its current lines at every print of the route tree',
    async () => {
      let line = 'MARK_FOOTER_FIRST'
      const start = {
        router: { routeTreeFileFooter: () => [`// ${line}`] },
      }
      const server =
        bundler === 'vite'
          ? await startDevServer({ files: {}, start })
          : await startRsbuildStartDevServer({
              files: { 'src/entry.ts': `export {}\n` },
              start,
            })
      const tree = () =>
        readFile(path.join(server.root, 'src/routeTree.gen.ts'), 'utf8').catch(
          () => '',
        )
      await until(
        async () => (await tree()).includes('MARK_FOOTER_FIRST'),
        'the first route tree',
      )
      line = 'MARK_FOOTER_NEXT'
      await server.write({
        'src/routes/later.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/later')({})
`,
      })
      await until(
        async () => (await tree()).includes(`'/later'`),
        'the route tree with /later',
      )
      expect(await tree()).toContain('// MARK_FOOTER_NEXT')
    },
    timeout,
  )
})
