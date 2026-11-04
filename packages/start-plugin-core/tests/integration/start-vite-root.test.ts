/**
 * Start's Vite plugin reads the app from Vite's root, not from the working
 * directory: `vite build <app>` run from another directory (a monorepo root,
 * a script) builds the app as `vite build` in its directory does.
 */
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createBuilder } from 'vite'
import { expect, onTestFinished, test } from 'vitest'
import { appFiles, buildStartApp, createStartApp } from './start-app'

const timeout = 60_000

/**
 * Makes a new directory the working directory: a monorepo root, whose
 * package.json is not the app's. (A sibling of the app: the generator moves
 * its temporary files from under the working directory into the app.)
 */
async function runElsewhere() {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'start-cwd-')))
  const cwd = process.cwd()
  // (finish callbacks run last first: leave `dir` before removing it)
  onTestFinished(async () => {
    process.chdir(cwd)
    await rm(dir, { recursive: true, force: true })
  })
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'monorepo', private: true }),
  )
  process.chdir(dir)
}

/** The HTML the built server of the app in `root` answers `url` with, in a Node process of its own. */
async function serverHtml(root: string, url: string) {
  const server = pathToFileURL(path.join(root, 'dist/server/server.js'))
  const script = `const { default: server } = await import(${JSON.stringify(server.href)})
const response = await server.fetch(new Request(${JSON.stringify(url)}))
process.stdout.write(await response.text())
`
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { cwd: root },
  )
  return stdout
}

// Start bundles the Start libraries (dependencies with a peer dependency on
// Start) in the SSR build, so that its compiler compiles their server fns.
// It looked for them in the working directory's package.json: run elsewhere,
// the SSR build left the library external, and its server fn, uncompiled,
// returned nothing.
test(
  "a build run from another directory: a Start library's server fn runs during SSR",
  async () => {
    const app = await createStartApp(
      appFiles({
        'package.json': JSON.stringify({
          name: 'app',
          type: 'module',
          dependencies: { 'server-fn-lib': '*' },
        }),
        'node_modules/server-fn-lib/package.json': JSON.stringify({
          name: 'server-fn-lib',
          type: 'module',
          exports: './index.js',
          peerDependencies: { '@tanstack/react-start': '*' },
        }),
        'node_modules/server-fn-lib/index.js': `import { createServerFn } from '@tanstack/react-start'
export const libFn = createServerFn().handler(async () => 'MARK_LIB_HANDLER')
`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { libFn } from 'server-fn-lib'
export const Route = createFileRoute('/')({
  loader: () => libFn(),
  component: () => \`loaded: \${Route.useLoaderData()}\`,
})
`,
      }),
    )
    await runElsewhere()
    await buildStartApp(app, 'vite')
    expect(await serverHtml(app.root, 'http://localhost/')).toContain(
      'loaded: MARK_LIB_HANDLER',
    )
  },
  timeout,
)

// Vite's root as configured can be relative (`root: '.'`, `vite build .`):
// the libraries' lookup then stopped at the working directory, short of a
// library hoisted to a monorepo's `node_modules` above it.
test(
  "a relative root: a Start library hoisted above the app's directory runs during SSR",
  async () => {
    const lib = 'node_modules/server-fn-lib'
    const monorepo = await createStartApp({
      'package.json': JSON.stringify({ name: 'monorepo', private: true }),
      [`${lib}/package.json`]: JSON.stringify({
        name: 'server-fn-lib',
        type: 'module',
        exports: './index.js',
        peerDependencies: { '@tanstack/react-start': '*' },
      }),
      [`${lib}/index.js`]: `import { createServerFn } from '@tanstack/react-start'
export const libFn = createServerFn().handler(async () => 'MARK_LIB_HANDLER')
`,
      ...Object.fromEntries(
        Object.entries(
          appFiles({
            'package.json': JSON.stringify({
              name: 'web',
              type: 'module',
              dependencies: { 'server-fn-lib': '*' },
            }),
            'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { libFn } from 'server-fn-lib'
export const Route = createFileRoute('/')({
  loader: () => libFn(),
  component: () => \`loaded: \${Route.useLoaderData()}\`,
})
`,
          }),
        ).map(([file, code]) => [`apps/web/${file}`, code]),
      ),
    })
    const web = path.join(monorepo.root, 'apps/web')
    process.chdir(web)
    const { tanstackStart } = await import(
      new URL('../../../react-start/dist/esm/plugin/vite.js', import.meta.url)
        .href
    )
    const builder = await createBuilder({
      root: '.',
      configFile: false,
      logLevel: 'error',
      plugins: [tanstackStart()],
    })
    await builder.buildApp()
    expect(await serverHtml(web, 'http://localhost/')).toContain(
      'loaded: MARK_LIB_HANDLER',
    )
  },
  timeout,
)
