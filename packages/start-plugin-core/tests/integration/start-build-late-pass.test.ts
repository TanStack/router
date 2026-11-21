/**
 * A module another plugin compiles to JavaScript from a file that is not
 * JavaScript (`.mdx` through `@mdx-js/rollup` on Vite, `@mdx-js/loader` on
 * Rsbuild) and that uses a TanStack Start factory (SPEC J4.12, G5): the
 * Start compiler compiles its output like any module of the app, so its
 * server fn's handler stays on the server and the client calls it by its
 * id. A page naming only the router is left as it is. A module that names
 * no Start package and finishes a builder another module exports is compiled
 * too.
 */
import { createRequire } from 'node:module'
import mdx from '@mdx-js/rollup'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
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
import type { StartBuild, StartBuildOptions } from '../build-harness'

const require = createRequire(import.meta.url)
const timeout = 60_000

const files = {
  'src/page.mdx': `# A page

Some *prose*.

import { createServerFn } from '@tanstack/react-start'
import { Link } from '@tanstack/react-router'
export const fn = createServerFn().handler(async () => 'MARK_MDX_HANDLER')
export const home = () => <Link to="/">home</Link>
`,
  'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
  'src/alias.ts': `export { createServerOnlyFn as only } from '@tanstack/react-start'
`,
  'src/finish.mdx': `import { base } from './b'
import { only } from './alias'
export const finished = base.handler(async () => 'MARK_MDX_FINISHED')
export const optional = base.handler?.(async () => 'MARK_MDX_OPTIONAL')
export const serverOnly = only(() => 'MARK_MDX_SERVER_ONLY')
`,
  'src/entry.ts': `export { fn } from './page.mdx'
export { finished } from './finish.mdx'
`,
  'src/ssr-entry.ts': `export { fn } from './page.mdx'
export { finished } from './finish.mdx'
${callByIdExports}`,
}

const mdxConfig = {
  viteConfig: { plugins: [{ enforce: 'pre', ...mdx() }] },
  rsbuildConfig: {
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /\.mdx$/,
              use: [{ loader: require.resolve('@mdx-js/loader') }],
            },
          ],
        },
      },
    },
  },
} satisfies Pick<StartBuildOptions, 'viteConfig' | 'rsbuildConfig'>

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      ...mdxConfig,
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  test('the client calls an MDX module’s server fn by its id, without its handler', async () => {
    expect(build.client.where('MARK_MDX_HANDLER')).toBe('nowhere')
    const url = (await build.client.run(`return entry.fn.url`)).result
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
    )
    expect(result).toBe('MARK_MDX_HANDLER')
  })

  test('a module finishing an imported builder keeps its handler on the server too', async () => {
    expect(build.client.where('MARK_MDX_FINISHED')).toBe('nowhere')
    expect(build.client.where('MARK_MDX_OPTIONAL')).toBe('nowhere')
    expect(build.client.where('MARK_MDX_SERVER_ONLY')).toBe('nowhere')
    const url = (await build.client.run(`return entry.finished.url`)).result
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
    )
    expect(result).toBe('MARK_MDX_FINISHED')
  })

  test.each([
    {
      name: 'its own builder',
      // (below a heading: the compiled JS puts it on another line)
      mdx: `# Page

import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
      at: 'base =',
    },
    {
      name: 'a re-export of a builder',
      mdx: `# Page

export { base } from './b'
`,
      at: 'base',
    },
    {
      name: 'a star of a module with a builder',
      mdx: `# Page

export * from './b'
`,
      at: 'export *',
    },
  ])(
    'a module exporting $name fails the client build at the export: an importer cannot follow it',
    async ({ mdx: source, at }) => {
      const error: unknown = await buildStart({
        bundler,
        files: {
          'src/b.ts': files['src/b.ts'],
          'src/page.mdx': source,
          'src/entry.ts': `import { base } from './page.mdx'
export const fn = base.handler(async () => 'MARK_MDX_FINISHED')
`,
        },
        entry: 'src/entry.ts',
        ...mdxConfig,
      }).then(
        (build) =>
          expect.fail(
            `the build succeeded; the handler's text is ${build.client.where('MARK_MDX_FINISHED')} in the client bundle`,
          ),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      // at its position in the MDX (also without a map: a loader that makes
      // none in production), never at a line of the compiled JS
      const position = diagnosticPosition(source, at)
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/page.mdx',
        root: error.root,
        position,
      })
      // (from line 2: Rsbuild prints `1:1` for a diagnostic without one;
      // line 1 is the heading)
      for (let other = 2; other <= 12; other++) {
        if (other !== position.line) {
          expect(
            findDiagnostics(error.diagnostics, {
              severity: 'error',
              file: 'src/page.mdx',
              root: error.root,
              position: { line: other },
            }),
            `a diagnostic at line ${other}`,
          ).toEqual([])
        }
      }
    },
    timeout,
  )

  // (the fix the refusal of a re-export gives)
  test(
    'a builder imported from its own module, not re-exported through the MDX file, builds, and its handler stays on the server',
    async () => {
      const fixed = await buildStart({
        bundler,
        files: {
          'src/b.ts': files['src/b.ts'],
          'src/page.mdx': `# Page

Some *prose*.
`,
          'src/entry.ts': `import { base } from './b'
import Page from './page.mdx'
export const fn = base.handler(async () => 'MARK_MDX_REEXPORT_FIX')
export const page = Page
`,
          'src/ssr-entry.ts': `export * from './entry'\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        ...mdxConfig,
      })
      expect(fixed.client.where('MARK_MDX_REEXPORT_FIX')).toBe('nowhere')
      const url = (await fixed.client.run(`return entry.fn.url`)).result
      const { result } = await fixed.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_MDX_REEXPORT_FIX')
    },
    timeout,
  )
})

// Vite only: a plugin may hand another language's output to the bundler as
// TypeScript (`moduleType: 'ts'`), which Rolldown compiles and the late pass
// cannot parse (it reads JavaScript). One naming a Start package fails the
// client build at its file; one naming none is left to the bundler (SPEC
// J4.12, J4.16).
describe('vite build of a module another plugin hands over as TypeScript', () => {
  const asTypeScript = {
    viteConfig: {
      plugins: [
        {
          name: 'foo-as-typescript',
          transform: {
            filter: { id: /\.foo$/ },
            handler: (code: string) => ({ code, moduleType: 'ts' }),
          },
        },
      ],
    },
  } satisfies Pick<StartBuildOptions, 'viteConfig'>

  test(
    'fails the client build when it names a Start package',
    async () => {
      const source = `import { createServerFn } from '@tanstack/react-start'
const label: string = 'MARK_FOO_HANDLER'
export const fn = createServerFn().handler(async () => label)
`
      const error: unknown = await buildStart({
        bundler: 'vite',
        files: {
          'src/page.foo': source,
          'src/entry.ts': `export { fn } from './page.foo'\n`,
        },
        entry: 'src/entry.ts',
        ...asTypeScript,
      }).then(
        (build) =>
          expect.fail(
            `the build succeeded; the handler's text is ${build.client.where('MARK_FOO_HANDLER')} in the client bundle`,
          ),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/page.foo',
        root: error.root,
      })
    },
    timeout,
  )

  // (a plugin after Start's late pass compiles the Markdown: the late pass
  // sees the text, which no JavaScript parser accepts)
  test(
    'leaves text another plugin compiles later to the bundler, though it names a router package',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/readme.md': `# Usage

To link: \`import { Link } from '@tanstack/react-router'\`.
`,
          'src/entry.ts': `import readme from './readme.md'\nexport const text = readme\n`,
        },
        entry: 'src/entry.ts',
        viteConfig: {
          plugins: [
            {
              name: 'markdown-as-text',
              enforce: 'post',
              transform: {
                filter: { id: /\.md$/ },
                handler: (code: string) => ({
                  code: `export default ${JSON.stringify(code)}`,
                }),
              },
            },
          ],
        },
      })
      expect(
        findDiagnostics(build.diagnostics, {
          file: 'src/readme.md',
          root: build.root,
        }),
      ).toEqual([])
      expect((await build.client.run('return entry.text')).result).toContain(
        '# Usage',
      )
    },
    timeout,
  )

  test(
    'leaves it to the bundler when it names none',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/page.foo': `const label: string = 'MARK_FOO_VALUE'
export const value = label
`,
          'src/entry.ts': `export { value } from './page.foo'\n`,
        },
        entry: 'src/entry.ts',
        ...asTypeScript,
      })
      expect(
        findDiagnostics(build.diagnostics, {
          file: 'src/page.foo',
          root: build.root,
        }),
      ).toEqual([])
      expect((await build.client.run('return entry.value')).result).toBe(
        'MARK_FOO_VALUE',
      )
    },
    timeout,
  )
})
