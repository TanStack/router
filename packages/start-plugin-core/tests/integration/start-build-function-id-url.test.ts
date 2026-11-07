/**
 * A server fn's id is one path segment of its URL (SPEC J4.4): the client
 * puts it after the server fn base unencoded and the server reads the
 * segment back. An id a custom `generateFunctionId` returns that the URL
 * never carried whole (a `/` or `#` that splits or ends it, `?`, `"`, `\`,
 * whitespace, a control or non-ASCII character a client percent-encodes,
 * a dot segment, a percent-encoding the server reads as another id or
 * rejects) fails the build with an error naming the defining file,
 * instead of a client that calls another function or none. An id with
 * other ASCII characters outside the unreserved set and `$` (`%`, `:`,
 * `'`, `+`, `@`, `|`, `[`…) builds and reaches its handler, as it did, with
 * a deprecation warning naming the file. An id of unreserved characters
 * and `$` builds without one.
 */
import { describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'

const timeout = 60_000

/** Ids the URL never carried whole, by file. */
const refused: Record<string, string> = {
  'src/slash.ts': 'users/get',
  'src/hash.ts': 'users#get',
  'src/query.ts': 'users?get',
  'src/quote.ts': 'users"get',
  'src/backslash.ts': 'users\\get',
  'src/space.ts': 'users get',
  'src/control.ts': 'users\u0007get',
  'src/non-ascii.ts': 'utilisateurs-é',
  'src/dot.ts': '..',
  // a percent-encoding the server decodes to another id, or rejects
  'src/decoded.ts': 'users%41get',
  'src/lowercase.ts': 'x%c3%a9',
  'src/encoded-dot.ts': '%2E',
  'src/malformed.ts': 'users%zz',
}

/** Ids that reach their handler, deprecated, by file. */
const deprecated: Record<string, string> = {
  'src/percent.ts': 'users%2Fget',
  'src/encoded-space.ts': 'users%20get',
  'src/colon.ts': 'users:get',
  'src/apostrophe.ts': "users'get",
  'src/plus.ts': 'users+get',
  'src/at.ts': 'users@get',
  'src/pipe.ts': 'users|get',
  'src/brackets.ts': 'users[get]',
}

const fine = { 'src/fine.ts': 'Users-get.v1_~$' }

const fnModule = (file: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => ${JSON.stringify(file)})
`

/**
 * The app of `ids`: a server fn per file, each exported by the entries as
 * `fn<index>`; the SSR entry also calls by id (`callByIdPrelude`).
 */
function app(ids: Record<string, string>) {
  const files: Record<string, string> = {}
  const entry: Array<string> = []
  Object.keys(ids).forEach((file, index) => {
    files[file] = fnModule(file)
    entry.push(
      `export { fn as fn${index} } from './${file.slice('src/'.length, -'.ts'.length)}'`,
    )
  })
  files['src/client-entry.ts'] = `${entry.join('\n')}\n`
  files['src/ssr-entry.ts'] = `${entry.join('\n')}\n${callByIdExports}`
  return {
    files,
    entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
    start: {
      serverFns: {
        generateFunctionId: ({ filename }: { filename: string }) =>
          ids[Object.keys(ids).find((file) => filename.endsWith(file)) ?? ''],
      },
    },
  }
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'an id the URL never carried whole fails the build, naming the file',
    async () => {
      const ids = { ...refused, ...deprecated, ...fine }
      const outcome = await buildStart({ bundler, ...app(ids) }).then(
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
        if (file in refused) {
          expectDiagnostic(diagnostics, { severity: 'error', file, root })
        } else {
          expect(
            findDiagnostics(diagnostics, { severity: 'error', file, root }),
            `errors naming ${file}`,
          ).toEqual([])
        }
      }
    },
    timeout,
  )

  test(
    'a deprecated id builds with a warning naming the file, and reaches its handler',
    async () => {
      const ids = { ...deprecated, ...fine }
      const { client, ssr, diagnostics, root } = await buildStart({
        bundler,
        ...app(ids),
      })
      for (const file of Object.keys(ids)) {
        const warnings = findDiagnostics(diagnostics, {
          severity: 'warning',
          file,
          root,
        })
        expect(warnings.length > 0, `a warning naming ${file}`).toBe(
          file in deprecated,
        )
      }
      const urls = (
        await client.run(
          `return [${Object.keys(ids).map((_, index) => `entry.fn${index}.url`)}]`,
        )
      ).result as Array<string>
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}const called = []
for (const url of ${JSON.stringify(urls)}) {
  const id = serverFnId(url)
  called.push([id, await callById(id)])
}
return called`,
          )
        ).result,
      ).toEqual(Object.entries(ids).map(([file, id]) => [id, file]))
    },
    timeout,
  )
})
