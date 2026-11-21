/**
 * A specifier with a URL fragment (`./secrets.ts#x`): the bundler loads the
 * file, so import protection judges the file, whichever rule denies it (a
 * `server-only` marker, a file rule naming its extension), and Start
 * compiles it as the file. Source: review round 3 (R3-G6-2; main stripped
 * the fragment). Vite's id keeps the fragment, which no id tells from a `#`
 * of a path: the rules judge the id and the id cut at its last `#`.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { reportedViolations } from '../../importProtection/start-apps'
import type { StartBuildError, StartBundler } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000

const build = (
  bundler: StartBundler,
  files: Record<string, string>,
  importProtection: ImportProtectionOptions = {},
) =>
  buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start: { importProtection },
  })

const importer = expect.stringMatching(/^src\/entry\.ts\b/)

/** The build's error, asserted (a pin fails on an assertion). */
async function failure(build: Promise<unknown>): Promise<StartBuildError> {
  const error = await build.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'the build fails').toBeInstanceOf(Error)
  return error as StartBuildError
}

describe.each(startBundlers)(
  '%s build: an import with a #fragment',
  (bundler) => {
    test(
      'of a file its server-only marker denies fails the build, naming the importer',
      async () => {
        const error = await failure(
          build(bundler, {
            'src/secrets.ts': `import '@tanstack/react-start/server-only'
export const API_KEY = 'MARK_SECRET'
`,
            'src/entry.ts': `import { API_KEY } from './secrets.ts#x'
;(globalThis as any).key = API_KEY
`,
          }),
        )
        expect(reportedViolations(error)).toEqual([
          { environment: 'client', importer },
        ])
      },
      timeout,
    )

    test(
      'of a file a rule naming its extension denies fails the build, naming the importer',
      async () => {
        const error = await failure(
          build(
            bundler,
            {
              'src/db.server.ts': `export const secret = () => 'MARK_SECRET'
`,
              'src/entry.ts': `import { secret } from './db.server.ts#x'
;(globalThis as any).secret = secret
`,
            },
            { client: { files: ['**/*.server.ts'] } },
          ),
        )
        expect(reportedViolations(error)).toEqual([
          { environment: 'client', importer },
        ])
      },
      timeout,
    )

    test(
      'of a module defining a server function is its client call, without its handler',
      async () => {
        const { client } = await build(bundler, {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const getSecret = createServerFn().handler(async () => 'MARK_HANDLER')
`,
          'src/entry.ts': `import { getSecret } from './fns.ts#x'
;(globalThis as any).getSecret = getSecret
`,
        })
        expect(client.where('MARK_HANDLER')).toBe('nowhere')
      },
      timeout,
    )
  },
)
