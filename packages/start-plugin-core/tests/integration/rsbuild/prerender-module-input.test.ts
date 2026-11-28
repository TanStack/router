/**
 * An Rsbuild build of a Start app with prerendering, started by a program
 * Node reads as module-mode input (`node --input-type=module`, from standard
 * input or `--eval`): the prerender writes the page.
 * Source: the RSC phase 1 re-check 7 (/var/tmp/rsc-p1-recheck7/report.md
 * finding 1, `build-controls7.py`: 86b46c235e exited 1 with "require is not
 * defined in ES module scope" and wrote no HTML, db260cf3a3 rendered).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { expect, test } from 'vitest'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { startRuntimeLinks } from '../../build-harness'

const timeout = 90_000

/** The app's build program: what a script calling Rsbuild's JavaScript API does. */
const program = `import { createRsbuild, loadConfig } from '@rsbuild/core'
const { content } = await loadConfig({ cwd: process.cwd() })
const rsbuild = await createRsbuild({ cwd: process.cwd(), rsbuildConfig: content })
const result = await rsbuild.build()
await result.close()
`

test(
  'a build started from module-mode input prerenders the page',
  async () => {
    const app = await closeAtEnd(
      () =>
        createApp({
          dir: path.dirname(fileURLToPath(import.meta.url)),
          prefix: '.prerender-module-input-',
          packageJson: { name: 'app', private: true, type: 'module' },
          symlinks: startRuntimeLinks(),
          files: {
            'rsbuild.config.mjs': `import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
export default defineConfig({
  plugins: [
    pluginReact(),
    tanstackStart({
      pages: [{ path: '/' }],
      prerender: { enabled: true, autoStaticPathsDiscovery: false, crawlLinks: false },
    }),
  ],
})
`,
            'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
            'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
            'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main>PRERENDERED_PAGE</main>
}
`,
            'tsconfig.json': JSON.stringify({
              compilerOptions: { jsx: 'react-jsx' },
            }),
          },
        }),
      (opened) => opened.dispose(),
    )
    // (`runNodeProgram`: `node --input-type=module --eval`)
    await runNodeProgram(program, {
      cwd: app.root,
      env: { ...process.env, NODE_ENV: 'production' },
      timeout: 60_000,
    })
    expect(
      readFileSync(path.join(app.root, 'dist/client/index.html'), 'utf8').match(
        /<main>(.*?)<\/main>/,
      )?.[1],
    ).toBe('PRERENDERED_PAGE')
  },
  timeout,
)
