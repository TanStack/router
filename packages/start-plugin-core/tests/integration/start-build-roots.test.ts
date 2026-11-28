/**
 * Start reads the app from the bundler's root as the app configures it:
 * relative (`vite build .`, Rsbuild's `root: '.'`) or through a symbolic link
 * (`vite build "$PWD"` in a linked directory).
 * Each builds the app as its plain absolute directory does (SPEC J4.16:
 * never the working directory): a Start library hoisted above the app's
 * directory is bundled and compiled in SSR, and the built server renders
 * the app's page and serves its server fn by id.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { callByIdExports, callByIdPrelude } from '../build-harness'
import { buildStart } from '../build-start'
import {
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'
import type { StartBuildOptions } from '../build-harness'

/**
 * A monorepo (the files of `StartBuildOptions.workspace`) whose
 * `node_modules` holds a Start library (a peer dependency on Start, hoisted)
 * and whose app in `repo/apps/web` depends on it; `link/web` links to the
 * app's directory from outside the monorepo.
 */
const hoistedLibrary: Pick<
  StartBuildOptions,
  'workspace' | 'packageJson' | 'files' | 'entry'
> = {
  workspace: {
    app: 'repo/apps/web',
    files: {
      'repo/package.json': JSON.stringify({ name: 'monorepo', private: true }),
      'repo/node_modules/server-fn-lib/package.json': JSON.stringify({
        name: 'server-fn-lib',
        type: 'module',
        exports: './index.js',
        peerDependencies: { '@tanstack/react-start': '*' },
      }),
      'repo/node_modules/server-fn-lib/index.js': `import { createServerFn } from '@tanstack/react-start'
export const libFn = createServerFn().handler(async () => 'MARK_LIB_HANDLER')
`,
    },
    symlinks: { 'link/web': 'repo/apps/web' },
  },
  packageJson: {
    name: 'web',
    private: true,
    type: 'module',
    dependencies: { 'server-fn-lib': '*' },
  },
  files: { 'src/entry.ts': `export { libFn } from 'server-fn-lib'\n` },
  entry: 'src/entry.ts',
}

// Source: src/vite/plugin.ts (`crawlFrameworkPkgs({ root: viteConfig.root ||
// process.cwd() })`).
// On main, the library stays external in the SSR build: Node loads it
// uncompiled, and its server fn returns undefined during SSR.
describe('Vite build of an app whose Start library is hoisted above it', () => {
  test("a relative root: the library's server fn runs during SSR", async () => {
    const { ssr } = await buildStart({
      ...hoistedLibrary,
      viteConfig: { root: '.' },
    })
    expect((await ssr.run(`return await entry.libFn()`)).result).toBe(
      'MARK_LIB_HANDLER',
    )
  })

  test("a root through a symbolic link: the library's server fn runs during SSR", async () => {
    const { ssr } = await buildStart({
      ...hoistedLibrary,
      root: (app) => path.join(app, '../../../link/web'),
    })
    expect((await ssr.run(`return await entry.libFn()`)).result).toBe(
      'MARK_LIB_HANDLER',
    )
  })
})

/** A page app whose `/` loader calls a server fn the SSR entry exposes. */
const pageApp = {
  files: {
    ...startPageEntries,
    'src/router.ts': routerFile,
    'src/routes/__root.tsx': rootDocument(),
    'src/fn.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_FN')
`,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { fn } from '../fn'
export const Route = createFileRoute('/')({
  loader: () => fn(),
  component: () => <p>{'MARK_INDEX ' + Route.useLoaderData()}</p>,
})
`,
    'src/client-entry.ts': `export {}\n`,
    'src/ssr-entry.ts': `export { fn } from './fn'
${callByIdExports}`,
  },
  entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
}

/** Serves the build and returns what `/` renders and what the server fn's id answers. */
async function servedApp(options: Partial<StartBuildOptions>) {
  const build = await buildStart({
    bundler: 'rsbuild',
    ...pageApp,
    ...options,
  })
  const served = await serveStartBuild(build)
  const response = await served.fetch('/')
  return {
    status: response.status,
    html: await response.text(),
    byId: (
      await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(entry.fn))`,
      )
    ).result,
  }
}

// Source: src/rsbuild/plugin.ts (`modifyRsbuildConfig`: `root =
// rsbuildConfig.root`), src/rsbuild/planning.ts `virtualPath`.
// On main, the build fails (Start's entries and virtual modules are not found).
describe('Rsbuild build of an app with a configured root', () => {
  // Control: the app's absolute directory.
  test('an absolute root: renders its page and serves its server fn by id', async () => {
    expect(await servedApp({})).toEqual({
      status: 200,
      html: expect.stringContaining('MARK_INDEX MARK_FN'),
      byId: 'MARK_FN',
    })
  })

  test('a relative root: renders its page and serves its server fn by id', async () => {
    expect(await servedApp({ rsbuildConfig: { root: '.' } })).toEqual({
      status: 200,
      html: expect.stringContaining('MARK_INDEX MARK_FN'),
      byId: 'MARK_FN',
    })
  })
})
