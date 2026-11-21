/**
 * A script imported under an asset query its bundler does not honour on a
 * script: the module is the file's code, as without the query (Vite:
 * `?inline`; Rsbuild: `?inline`, `?url`, `?sharedworker`, which only its
 * asset rules read). Start compiles it as the file: its server function is
 * the client's call (SPEC J4.1), and import protection judges its imports
 * (J6.1). Source: review round 3 (R3-G6-1; main compiled such ids).
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import type { StartBundler } from '../../build-harness'

const timeout = 60_000

const queries: Array<[StartBundler, string]> = [
  ['vite', '?inline'],
  ['rsbuild', '?inline'],
  ['rsbuild', '?url'],
  ['rsbuild', '?sharedworker'],
]

const build = (bundler: StartBundler, session: string, use: string) =>
  buildStart({
    bundler,
    files: {
      'src/lib/session.ts': session,
      'src/entry.ts': use,
    },
    entry: 'src/entry.ts',
  })

describe.each(queries)(
  '%s build: a script imported with %s',
  (bundler, query) => {
    const specifier = JSON.stringify(`./lib/session.ts${query}`)

    test(
      'is compiled: a server function is the client call, without its handler',
      async () => {
        const { client } = await build(
          bundler,
          `import { createServerFn } from '@tanstack/react-start'
export const getSecret = createServerFn().handler(async () => 'MARK_HANDLER')
`,
          `import { getSecret } from ${specifier}
;(globalThis as any).getSecret = getSecret
`,
        )
        expect(client.where('MARK_HANDLER')).toBe('nowhere')
      },
      timeout,
    )

    test(
      'its import of a denied specifier fails the build, naming the module',
      async () => {
        const error = await rejection(
          build(
            bundler,
            `import { getCookie } from '@tanstack/react-start/server'
export const read = () => getCookie('sid')
`,
            `import { read } from ${specifier}
;(globalThis as any).read = read
`,
          ),
        )
        expect(reportedViolations(error)).toEqual([
          {
            environment: 'client',
            importer: expect.stringMatching(/^src\/lib\/session\.ts\b/),
          },
        ])
      },
      timeout,
    )
  },
)
