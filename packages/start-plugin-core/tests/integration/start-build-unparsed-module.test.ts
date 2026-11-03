/**
 * A module Start compiles that the compiler cannot parse never ships
 * untransformed (SPEC J4.12, G5). A TypeScript grammar error the bundler's
 * transpiler lets through (`value!: string = '…'`: a definite assignment
 * assertion with an initializer, which SWC and esbuild accept) in a module
 * that defines a server function fails the build with an error positioned in
 * that module, instead of a client bundle carrying the handler and what it
 * reads. Rsbuild (SWC) is the row where the bundler alone would have shipped
 * the module; on Vite its own transpiler rejects the file too.
 *
 * The same holds for a module that names no `@tanstack/*` package, whose
 * builder comes from the app's own module (`import { base } from
 * './lib/base'`, re-exporting Start's builder): text Yuku rejects and the
 * bundler accepts (a TypeScript grammar error SWC lets through, or a `.cts`
 * module written with ES module syntax, which both bundlers accept) fails the
 * client build, naming the module and the position.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a server-fn module the compiler cannot parse fails the build with an error positioned in the module',
    async () => {
      const outcome = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
class Secret {
  value!: string = 'MARK_SERVER_SECRET'
}
export const reveal = createServerFn().handler(async () => new Secret().value)
`,
          'src/entry.ts': `export { reveal } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      }).then(
        (build) => ({
          built: true as const,
          secret: build.client.where('MARK_SERVER_SECRET'),
        }),
        (error: unknown) => {
          if (!(error instanceof StartBuildError)) {
            throw error
          }
          return {
            built: false as const,
            diagnostics: error.diagnostics,
            root: error.root,
          }
        },
      )
      if (outcome.built) {
        expect.fail(
          `the build succeeded; the handler's text is ${outcome.secret} in the client bundle`,
        )
      }
      expectDiagnostic(outcome.diagnostics, {
        severity: 'error',
        file: 'src/fns.ts',
        root: outcome.root,
        position: { line: 3 },
      })
    },
    timeout,
  )
})

const handler = `export const reveal = base.handler(async () => 'MARK_SERVER_SECRET')`
const baseImport = `import { base } from './lib/base'`

/** Line 2 holds what Yuku rejects (line 1 for `.cts`). */
const unparsable: Record<string, { file: string; text: string; line: number }> =
  {
    'a definite assignment with an initializer': {
      file: 'src/fns.ts',
      text: `${baseImport}\nlet v!: string = 'x'\nexport const s = v\n${handler}\n`,
      line: 2,
    },
    'an empty type parameter list': {
      file: 'src/fns.ts',
      text: `${baseImport}\nfunction g<>() {}\nexport const s = g\n${handler}\n`,
      line: 2,
    },
    'a type-only import of a default and named bindings': {
      file: 'src/fns.ts',
      text: `${baseImport}\nimport type T, { U } from './types'\nexport type V = T | U\n${handler}\n`,
      line: 2,
    },
    'a .cts module with ES module syntax': {
      file: 'src/fns.cts',
      text: `${baseImport}\n${handler}\n`,
      line: 1,
    },
  }

const appFiles = (file: string, text: string) => ({
  'src/builders.ts': `export { createServerFn } from '@tanstack/react-start'\n`,
  'src/lib/base.ts': `import { createServerFn } from '../builders'\nexport const base = createServerFn()\n`,
  'src/types.ts': `export default interface T {}\nexport interface U {}\n`,
  [file]: text,
  'src/entry.ts': `export { reveal } from './${path.basename(file, '.ts')}'\n`,
})

describe.each(startBundlers)(
  '%s build, a module naming no Start package',
  (bundler) => {
    test(
      'that parses builds with its handler on the server only',
      async () => {
        const { client } = await buildStart({
          bundler,
          files: appFiles('src/fns.ts', `${baseImport}\n${handler}\n`),
          entry: 'src/entry.ts',
        })
        expect(client.where('MARK_SERVER_SECRET')).toBe('nowhere')
      },
      timeout,
    )

    test(
      'that references a markdown asset builds, the asset left to the bundler',
      async () => {
        const { client } = await buildStart({
          bundler,
          files: {
            ...appFiles('src/fns.ts', `${baseImport}\n${handler}\n`),
            'src/readme.md': '# Hello\n\nSome *markdown* text.\n',
            'src/entry.ts': `export { reveal } from './fns'\nexport const readme = new URL('./readme.md', import.meta.url).href\n`,
          },
          entry: 'src/entry.ts',
        })
        expect(client.where('MARK_SERVER_SECRET')).toBe('nowhere')
      },
      timeout,
    )

    test.for(Object.entries(unparsable))(
      'with %s fails the client build with an error positioned in the module',
      { timeout },
      async ([, { file, text, line }]) => {
        const outcome = await buildStart({
          bundler,
          files: appFiles(file, text),
          entry: 'src/entry.ts',
        }).then(
          (build) => ({
            built: true as const,
            secret: build.client.where('MARK_SERVER_SECRET'),
          }),
          (error: unknown) => {
            if (!(error instanceof StartBuildError)) {
              throw error
            }
            return {
              built: false as const,
              diagnostics: error.diagnostics,
              root: error.root,
            }
          },
        )
        if (outcome.built) {
          expect.fail(
            `the build succeeded; the handler's text is ${outcome.secret} in the client bundle`,
          )
        }
        expectDiagnostic(outcome.diagnostics, {
          severity: 'error',
          file,
          root: outcome.root,
          position: { line },
        })
      },
    )
  },
)
