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
import { beforeAll, describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  buildStart,
  buildStartShared,
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
export { finished, optional, serverOnly } from './finish.mdx'
`,
  'src/ssr-entry.ts': `export { fn } from './page.mdx'
export { finished, optional, serverOnly } from './finish.mdx'
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
  beforeAll(async () => {
    build = await buildStartShared({
      bundler,
      files,
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      ...mdxConfig,
    })
    return () => build.close()
  }, timeout)

  test('the client calls an MDX module’s server fn by its id, without its handler', async () => {
    expect(build.client.where('MARK_MDX_HANDLER')).toBe('nowhere')
    const url = (await build.client.run(`return entry.fn.url`)).result
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
    )
    expect(result).toBe('MARK_MDX_HANDLER')
  })

  test.each([
    { name: 'finishing', exported: 'finished', mark: 'MARK_MDX_FINISHED' },
    {
      name: 'finishing in an optional call',
      exported: 'optional',
      mark: 'MARK_MDX_OPTIONAL',
    },
  ])(
    'a module $name an imported builder keeps its handler on the server too',
    async ({ exported, mark }) => {
      expect(build.client.where(mark)).toBe('nowhere')
      const url = (await build.client.run(`return entry.${exported}.url`))
        .result
      const { result } = await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe(mark)
    },
  )

  test('a module passing a function to an imported server-only factory runs it on the server only', async () => {
    expect(build.client.where('MARK_MDX_SERVER_ONLY')).toBe('nowhere')
    expect((await build.ssr.run(`return entry.serverOnly()`)).result).toBe(
      'MARK_MDX_SERVER_ONLY',
    )
    // the client's export is a function, whose call throws the refusal the
    // docs quote (environment-functions.md)
    expect(
      (
        await build.client.run(`if (typeof entry.serverOnly !== 'function') {
  return typeof entry.serverOnly
}
try {
  entry.serverOnly()
  return 'ran'
} catch (error) {
  return error instanceof Error ? error.message : String(error)
}`)
      ).result,
    ).toBe('createServerOnlyFn() functions can only be called on the server!')
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
          expectNoDiagnostic(
            error.diagnostics,
            {
              severity: 'error',
              file: 'src/page.mdx',
              root: error.root,
              position: { line: other },
            },
            `a diagnostic at line ${other}`,
          )
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
// TypeScript (`moduleType: 'ts'`), which Rolldown compiles: the late pass
// reads it as TypeScript too, and compiles it like any module of the app
// (SPEC J4.12, J4.16). One naming no Start package is left to the bundler.
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

  // (the late pass read it as JSX and failed the client build at the type
  // annotation; without the late pass, the handler ships to the client)
  test(
    'compiles its server fn: the client calls it by its id, without its handler',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/page.foo': `import { createServerFn } from '@tanstack/react-start'
const label: string = 'MARK_FOO_HANDLER'
export const fn = createServerFn().handler(async (): Promise<string> => label)
`,
          'src/entry.ts': `export { fn } from './page.foo'\n`,
          'src/ssr-entry.ts': `export { fn } from './page.foo'\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        ...asTypeScript,
      })
      expect(build.client.where('MARK_FOO_HANDLER')).toBe('nowhere')
      const url = (await build.client.run(`return entry.fn.url`)).result
      const { result } = await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_FOO_HANDLER')
    },
    timeout,
  )

  // A namespace's exported members keep their values though only erased
  // code reads them (several names in one statement, a pattern), whatever
  // the declaration's spelling.
  test.each([
    { name: 'Config', declaration: 'namespace Config' },
    { name: 'Config', declaration: 'namespace /* units */ Config' },
    { name: 'Δ', declaration: 'namespace Δ' },
  ])(
    'keeps the exported members of $declaration that only erased code reads',
    async ({ name, declaration }) => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/math.foo': `import { createServerOnlyFn } from '@tanstack/react-start'
export ${declaration} {
  export const a = 1, b = Number('2')
  export const { c, d } = { c: 3, d: 4 }
  export const sum = createServerOnlyFn(() => b + d)
}
`,
          'src/entry.ts': `import { ${name} as C } from './math.foo'
export const result = [C.a, C.b, C.c, C.d]
`,
        },
        entry: 'src/entry.ts',
        ...asTypeScript,
      })
      expect((await build.client.run('return entry.result')).result).toEqual([
        1, 2, 3, 4,
      ])
    },
    timeout,
  )

  // (a namespace, or a module augmentation declaring no value, beside a
  // client-only fn the compile rewrites)
  test.each([
    {
      name: 'a namespace',
      declaration: `export namespace /* prices */ Prices {
  export const low = 1, high = 2
}
`,
      values: 'Prices.low, Prices.high',
    },
    {
      name: 'a module augmentation',
      declaration: `declare module 'x' {
  export const low: number, high: number
}
`,
      values: '1, 2',
    },
  ])(
    'builds $name beside a client-only fn',
    async ({ declaration, values }) => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/prices.foo': `import { createClientOnlyFn } from '@tanstack/react-start'
${declaration}const getLimit = createClientOnlyFn(() => 10)
export function read() {
  return [${values}, getLimit()]
}
`,
          'src/entry.ts': `export { read } from './prices.foo'\n`,
          'node_modules/x/package.json': JSON.stringify({
            name: 'x',
            main: 'index.js',
            types: 'index.d.ts',
          }),
          'node_modules/x/index.js': 'exports.unit = 1\n',
          'node_modules/x/index.d.ts': 'export const unit: number\n',
        },
        entry: 'src/entry.ts',
        ...asTypeScript,
      })
      expect((await build.client.run('return entry.read()')).result).toEqual([
        1, 2, 10,
      ])
    },
    timeout,
  )

  // (a namespace exporting one name per statement keeps them; `namespace`
  // in a comment or a string declares none)
  test.each([
    {
      name: 'a namespace exporting one name per statement',
      declaration: `export namespace Values {
  export const label: string = 'ok'
}
`,
      expression: 'Values.label',
    },
    {
      name: 'a comment naming a namespace',
      declaration: '// namespace Example {\n',
      expression: "'ok' as string",
    },
    {
      name: 'a string naming a namespace',
      declaration: "const example = 'namespace Example {'\n",
      expression: "'ok' as string",
    },
  ])(
    'builds one that names a router package with $name',
    async ({ declaration, expression }) => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/thing.foo': `import { createMemoryHistory } from '@tanstack/react-router'
${declaration}export const value: string = createMemoryHistory({
  initialEntries: ['/' + (${expression})],
}).location.pathname
`,
          'src/entry.ts': `export { value } from './thing.foo'\n`,
        },
        entry: 'src/entry.ts',
        ...asTypeScript,
      })
      expect((await build.client.run('return entry.value')).result).toBe('/ok')
    },
    timeout,
  )

  test(
    'builds one that names a router package',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: {
          'src/page.foo': `import { createMemoryHistory } from '@tanstack/react-router'
export const value: string = createMemoryHistory({
  initialEntries: ['/MARK_FOO_TYPED'],
}).location.pathname
`,
          'src/entry.ts': `export { value } from './page.foo'\n`,
        },
        entry: 'src/entry.ts',
        ...asTypeScript,
      })
      expectNoDiagnostic(build.diagnostics, {
        file: 'src/page.foo',
        root: build.root,
      })
      expect((await build.client.run('return entry.value')).result).toBe(
        '/MARK_FOO_TYPED',
      )
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
      expectNoDiagnostic(build.diagnostics, {
        file: 'src/readme.md',
        root: build.root,
      })
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
      expectNoDiagnostic(build.diagnostics, {
        file: 'src/page.foo',
        root: build.root,
      })
      expect((await build.client.run('return entry.value')).result).toBe(
        'MARK_FOO_VALUE',
      )
    },
    timeout,
  )
})

// The JavaScript of an `.mdx` that finishes a builder another module exports
// (so it names no Start package) and nests code past the parser's depth
// limit: the bundler parses it, the compiler cannot, so its handler cannot
// be removed from the client. The late pass fails the client build at it,
// as the main pass fails a script's (it read the `.mdx` name as no
// language, and left the module to the bundler with its handler).
// Source: Astra's review of the parser's depth limit (KNOWN-BUGS accepted
// limit); settlement steps 3 (Vite) and 4 (Rsbuild).
describe.each(startBundlers)(
  '%s build, an MDX module the compiler cannot parse',
  (bundler) => {
    test(
      'fails the client build at the module',
      async () => {
        const error = await buildStart({
          bundler,
          files: {
            'src/b.ts': files['src/b.ts'],
            'src/deep.mdx': `import { base } from './b'
export const deep = ${'['.repeat(600)}1${']'.repeat(600)}
export const finished = base.handler(async () => 'MARK_DEEP_HANDLER')
`,
            'src/entry.ts': `export { finished } from './deep.mdx'\n`,
          },
          entry: 'src/entry.ts',
          ...mdxConfig,
        }).then(
          () => expect.fail('the build succeeded'),
          (e: unknown) => e,
        )
        if (!(error instanceof StartBuildError)) {
          throw error
        }
        expectDiagnostic(error.diagnostics, {
          severity: 'error',
          file: 'src/deep.mdx',
          root: error.root,
        })
      },
      timeout,
    )
  },
)

// An MDX module the app also imports as its text (`?raw` typed
// `asset/source`, the MDX loader still compiling it to JavaScript): the
// text is the loader's output, not Start's (whose client output removes the
// handler), and the page's own import is compiled as before.
// Source: whole-PR review S5-10; settlement step 4.
describe('rsbuild build, an MDX module imported as its text', () => {
  test(
    'the text is not compiled; the module is',
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/page.mdx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_SOURCE_HANDLER')
`,
          'src/entry.ts': `export { fn } from './page.mdx'
// @ts-expect-error (a text module)
export { default as text } from './page.mdx?raw'
`,
        },
        entry: 'src/entry.ts',
        rsbuildConfig: {
          tools: {
            rspack: {
              module: {
                rules: [
                  {
                    test: /\.mdx$/,
                    use: [{ loader: require.resolve('@mdx-js/loader') }],
                  },
                  { resourceQuery: /^\?raw$/, type: 'asset/source' },
                ],
              },
            },
          },
        },
      })
      const { result } = await build.client.run(
        'return [String(entry.text), typeof entry.fn.url]',
      )
      const [text, url] = result as [string, string]
      expect(text).toContain('MARK_SOURCE_HANDLER')
      expect(url).toBe('string')
    },
    timeout,
  )
})

// A `.mdx` the app types `json` (an Rspack rule): Rspack parses it as JSON,
// and Start's late pass leaves it to Rspack (it reads the module's type, as
// for `asset/source`).
// Source: Astra's review of settlement step 4, finding 2
// (`step4-rsbuild.mjs`, scenario `json`).
describe('rsbuild build, a module the app types as JSON', () => {
  test(
    'is Rspack’s to parse: the client gets the object',
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/help.mdx': `{"content":"import and export","title":"MARK_JSON_TITLE"}`,
          'src/entry.ts': `// @ts-expect-error (a JSON module)
export { default as help } from './help.mdx'
`,
        },
        entry: 'src/entry.ts',
        rsbuildConfig: {
          tools: {
            rspack: {
              module: { rules: [{ test: /\.mdx$/, type: 'json' }] },
            },
          },
        },
      })
      const { result } = await build.client.run('return entry.help.title')
      expect(result).toBe('MARK_JSON_TITLE')
    },
    timeout,
  )
})

const fooPage = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_FOO_HANDLER')
`
const fooRule = {
  rsbuildConfig: {
    tools: {
      rspack: {
        module: { rules: [{ test: /\.foo$/, type: 'javascript/auto' }] },
      },
    },
  },
}
/** A loader exporting its file's text. */
const textLoader = `module.exports = function (source) {
  return 'export default ' + JSON.stringify(source)
}
`
/** A loader replacing its file with a module that uses no Start. */
const cleanLoader = `module.exports = function () {
  return "export default 'MARK_CLEAN'"
}
`

// A file type the late pass does not read (it reads the JavaScript of
// `.vue`, `.svelte`, `.md`, `.mdx`, `.astro` and `.marko` files), which an
// app's rule makes JavaScript (`javascript/auto`): its server fn's handler
// would reach the client, so the build fails at the module. CSS (css-loader's
// JavaScript) and an SVG (an asset) use no Start: no error.
// Source: pile-of-cases audit 2b (Fable C1: the handler shipped in the
// eager client bundle, no diagnostic); decision: fail closed (option B).
describe('rsbuild build, a module of a file type the late pass does not read', () => {
  test(
    'fails the build naming the file when it uses Start',
    async () => {
      const error = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/page.foo': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_FOO_HANDLER')
`,
          'src/entry.ts': `// @ts-expect-error (a module of an app rule)
export { fn } from './page.foo'
`,
        },
        entry: 'src/entry.ts',
        rsbuildConfig: {
          tools: {
            rspack: {
              module: { rules: [{ test: /\.foo$/, type: 'javascript/auto' }] },
            },
          },
        },
      }).then(
        () => expect.fail('the build succeeded'),
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

  test(
    'builds a CSS module and an SVG',
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/a.module.css': `.a { color: red; }\n`,
          'src/icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>\n`,
          'src/entry.ts': `// @ts-expect-error (a CSS module)
import styles from './a.module.css'
// @ts-expect-error (an asset)
import icon from './icon.svg'
export const parts = [typeof styles.a, typeof icon]
`,
        },
        entry: 'src/entry.ts',
      })
      expectNoDiagnostic(build.diagnostics, { severity: 'error' })
      expect((await build.client.run('return entry.parts')).result).toEqual([
        'string',
        'string',
      ])
    },
    timeout,
  )

  // (a loader that exports a file's text: the text quoting a Start package
  // is no import of it)
  test(
    'builds a module whose text quotes a Start package it does not import',
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/sample.txt': `import { createServerFn } from '@tanstack/react-start'\n`,
          'src/text-loader.cjs': textLoader,
          'src/entry.ts': `// @ts-expect-error (a text module)
export { default as sample } from './sample.txt'
`,
        },
        entry: 'src/entry.ts',
        rsbuildConfig: {
          tools: {
            rspack: {
              module: {
                rules: [
                  {
                    test: /\.txt$/,
                    type: 'javascript/auto',
                    use: [{ loader: './src/text-loader.cjs' }],
                  },
                ],
              },
            },
          },
        },
      })
      expectNoDiagnostic(build.diagnostics, { severity: 'error' })
      expect((await build.client.run('return entry.sample')).result).toContain(
        '@tanstack/react-start',
      )
    },
    timeout,
  )

  // (two modules of one file: a loader's clean output does not withdraw the
  // other module's failure, whose handler would reach the client; the dev
  // rows: `rsbuild/dev-late-file-type.test.ts`)
  test(
    'fails the build when another module of the same file is clean',
    async () => {
      const error = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/page.foo': fooPage,
          'src/clean-loader.cjs': cleanLoader,
          'src/entry.ts': `// @ts-expect-error (a module of an app rule)
export { fn } from './page.foo'
// @ts-expect-error (a loader's module)
export { default as clean } from '!!./clean-loader.cjs!./page.foo'
`,
        },
        entry: 'src/entry.ts',
        ...fooRule,
      }).then(
        () => expect.fail('the build succeeded'),
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
})
