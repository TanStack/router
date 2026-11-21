/**
 * An app entry named like a denied file (a server entry `src/entry.server.ts`,
 * Remix's name) that a client module's pattern import reaches
 * (`import.meta.glob`, Rsbuild's `import.meta.webpackContext`): the client
 * gets its mock and the build reports it, as for any denied file (SPEC J6.1).
 * Source: review round 3 (R3-G6-6).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import type { StartBundler } from '../../build-harness'

const timeout = 60_000

const patternImport: Record<StartBundler, string> = {
  vite: `const modules = import.meta.glob('./*.ts', { eager: true })
;(globalThis as any).modules = modules
`,
  rsbuild: `const context = import.meta.webpackContext('./', { regExp: /\\.ts$/ })
;(globalThis as any).modules = context.keys().map((key) => context(key))
`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a pattern import of a client module reaching the *.server.ts server entry gets its mock, reported',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/entry.server.ts': `export default {
  fetch: () => new Response('MARK_SERVER_ENTRY'),
}
`,
          'src/pages.ts': patternImport[bundler],
          'src/entry.ts': `import './pages'\n`,
        },
        entry: 'src/entry.ts',
        start: {
          server: { entry: 'entry.server.ts' },
          importProtection: { behavior: 'mock' },
        },
      })
      expect(build.client.where('MARK_SERVER_ENTRY')).toBe('nowhere')
      expect(
        build.violations
          .filter((v) => v.env === 'client')
          .map((v) => v.resolved?.endsWith('/src/entry.server.ts')),
      ).toContain(true)
    },
    timeout,
  )
})
