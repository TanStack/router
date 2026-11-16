/**
 * Start's Rsbuild plugin reads the app from Rsbuild's root, not from the
 * working directory: `rsbuild build --root <app>` run from another directory
 * (a monorepo root, a script) builds the app as `rsbuild build` in its
 * directory does.
 */
import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createRsbuild } from '@rsbuild/core'
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

// Start's virtual modules (here, RSC's serialization adapters, which import
// `@tanstack/react-start`) were written under the working directory, where
// the app's packages do not resolve: the build failed with "Module not
// found".
test(
  'an RSC app builds when the build runs from another directory',
  async () => {
    const app = await createStartApp(
      appFiles({
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })
`,
      }),
    )
    await runElsewhere()
    const build = await buildStartApp(app, 'rsbuild', {
      rsc: { enabled: true },
    })
    expect(build.client).toContain('MARK_INDEX')
  },
  timeout,
)

/** What the built server of the app in `root` answers `url` with, in a Node process of its own. */
async function serverResponse(root: string, url: string) {
  const serverJs = path.join(root, 'dist/server/server.js')
  const entry = pathToFileURL(
    existsSync(serverJs) ? serverJs : path.join(root, 'dist/server/index.js'),
  )
  const script = `const { default: server } = await import(${JSON.stringify(entry.href)})
const response = await server.fetch(new Request(${JSON.stringify(url)}))
process.stdout.write(JSON.stringify({ status: response.status, html: await response.text() }))
`
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { cwd: root },
  )
  return JSON.parse(stdout) as { status: number; html: string }
}

// Rsbuild accepts a relative `root` (resolved against its `cwd`), and its
// plugins see it as written: the virtual modules' paths were relative too,
// and the modules importing them did not find them.
test(
  'an app whose Rsbuild root is relative builds and renders its pages',
  async () => {
    const app = await createStartApp(
      appFiles({
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })
`,
      }),
    )
    const { tanstackStart } = await import(
      new URL(
        '../../../react-start/dist/esm/plugin/rsbuild.js',
        import.meta.url,
      ).href
    )
    const rsbuild = await createRsbuild({
      cwd: app.root,
      loadEnv: false,
      rsbuildConfig: {
        root: '.',
        logLevel: 'error',
        plugins: [tanstackStart()],
      },
    })
    await rsbuild.build()
    const response = await serverResponse(app.root, 'http://localhost/')
    expect(response.status).toBe(200)
    expect(response.html).toContain('MARK_INDEX')
  },
  timeout,
)
