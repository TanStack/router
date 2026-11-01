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
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
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
      mdx: `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
    },
    { name: 'a re-export of a builder', mdx: `export { base } from './b'\n` },
    { name: 'a star of a module with a builder', mdx: `export * from './b'\n` },
  ])(
    'a module exporting $name fails the client build: an importer cannot follow it',
    async ({ mdx: source }) => {
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
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/page.mdx',
        root: error.root,
      })
    },
    timeout,
  )
})
