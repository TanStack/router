/**
 * Start's Rsbuild plugin reads the app from Rsbuild's root, not from the
 * working directory: `rsbuild build --root <app>` run from another directory
 * (a monorepo root, a script) builds the app as `rsbuild build` in its
 * directory does.
 */
import { realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
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
