/**
 * A server fn's id is one path segment of its URL (SPEC J4.4): the client
 * puts it after the server fn base unencoded and the server reads the
 * segment back. An id a custom `generateFunctionId` returns that the URL
 * cannot carry whole (a `/` or `#` that splits or ends it, `?`, `%`,
 * whitespace, a control or non-ASCII character a client percent-encodes,
 * a dot segment) fails the build with an error naming the defining file,
 * instead of a client that calls another function or none. An id of
 * unreserved characters and `$` builds.
 */
import { describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

/** The id the generator returns for each file. */
const ids: Record<string, string> = {
  'src/slash.ts': 'users/get',
  'src/hash.ts': 'users#get',
  'src/query.ts': 'users?get',
  'src/percent.ts': 'users%2Fget',
  'src/space.ts': 'users get',
  'src/control.ts': 'users\u0007get',
  'src/non-ascii.ts': 'utilisateurs-é',
  'src/colon.ts': 'users:get',
  'src/dot.ts': '..',
  'src/fine.ts': 'Users-get.v1_~$',
}

const fnModule = (file: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => ${JSON.stringify(file)})
`

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'an id that is not one URL path segment fails the build, naming the file',
    async () => {
      const files: Record<string, string> = {}
      const entry: Array<string> = []
      Object.keys(ids).forEach((file, index) => {
        files[file] = fnModule(file)
        entry.push(
          `export { fn as fn${index} } from './${file.slice('src/'.length, -'.ts'.length)}'`,
        )
      })
      files['src/entry.ts'] = `${entry.join('\n')}\n`
      const outcome = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: {
          serverFns: {
            generateFunctionId: ({ filename }) =>
              ids[
                Object.keys(ids).find((file) => filename.endsWith(file)) ?? ''
              ],
          },
        },
      }).then(
        () => ({ built: true as const }),
        (error: unknown) => {
          if (!(error instanceof StartBuildError)) {
            throw error
          }
          return { built: false as const, error }
        },
      )
      if (outcome.built) {
        expect.fail('the build succeeded')
      }
      const { diagnostics, root } = outcome.error
      for (const file of Object.keys(ids)) {
        if (file === 'src/fine.ts') {
          expect(
            findDiagnostics(diagnostics, { severity: 'error', file, root }),
            `errors naming ${file}`,
          ).toEqual([])
        } else {
          expectDiagnostic(diagnostics, { severity: 'error', file, root })
        }
      }
    },
    timeout,
  )
})
