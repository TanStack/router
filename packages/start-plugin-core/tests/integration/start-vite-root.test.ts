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
import { expect, onTestFinished, test } from 'vitest'
import { appFiles, buildStartApp, createStartApp } from './start-app'
import type { StartApp } from './start-app'

const timeout = 60_000

/**
 * Makes a new directory the working directory: a monorepo root, whose
 * package.json is not the app's. (A sibling of the app: the generator moves
 * its temporary files from under the working directory into the app.)
 */
async function runElsewhere() {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'start-cwd-')))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'monorepo', private: true }),
  )
  process.chdir(dir)
}

/** The HTML the built server answers `url` with, in a Node process of its own. */
async function serverHtml(app: StartApp, url: string) {
  const server = pathToFileURL(path.join(app.root, 'dist/server/server.js'))
  const script = `const { default: server } = await import(${JSON.stringify(server.href)})
const response = await server.fetch(new Request(${JSON.stringify(url)}))
process.stdout.write(await response.text())
`
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { cwd: app.root },
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
    expect(await serverHtml(app, 'http://localhost/')).toContain(
      'loaded: MARK_LIB_HANDLER',
    )
  },
  timeout,
)
