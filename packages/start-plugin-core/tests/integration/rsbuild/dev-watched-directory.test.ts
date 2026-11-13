/**
 * Start's Rsbuild dev server in an app whose CSS tooling watches the source
 * directory as a whole: Tailwind CSS's PostCSS plugin reports the
 * directories it scans (`dir-dependency`), and the CSS loader makes them
 * context dependencies, so Rspack reports `src` as modified with every edit
 * below it (a fresh `@tanstack/cli` Rsbuild app with Tailwind). That
 * directory is no file created: an edit builds what it changes, and a file
 * created below it still reaches the modules it shadows.
 * Source: release check, real installs F1 (under Yarn PnP, the first route
 * edit of such an app rebuilt a module of a package and broke every later
 * compile).
 */
import path from 'node:path'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { rootDocument, routerFile } from '../start-compose-app'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 60_000

/** Has every compile watch the app's `src` directory, as Tailwind's PostCSS plugin does. */
const watchSourceDirectory: RsbuildPlugin = {
  name: 'watch-source-directory',
  setup(api) {
    const src = path.join(api.context.rootPath, 'src')
    api.modifyRspackConfig((config) => {
      config.plugins.push({
        apply(compiler: Rspack.Compiler) {
          compiler.hooks.thisCompilation.tap(
            'watch-source-directory',
            (compilation) => {
              compilation.contextDependencies.add(src)
            },
          )
        },
      })
    })
  },
}

const appFiles = {
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
}

/** A server fn module whose handler returns `MARK_HANDLER_<version>`. */
const greetModule = (version: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_HANDLER_${version}')
`

/** The index route: a label, the last call's result and a counter (its state). */
const indexRoute = (
  label: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { greet } from '../greet.functions'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [called, setCalled] = useState('')
  const [count, setCount] = useState(0)
  return (
    <main>
      <p data-testid="label">${label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
      <button data-testid="count" onClick={() => setCount(count + 1)}>count {count}</button>
    </main>
  )
}
`

describe('Rsbuild dev with HMR: an app that watches its source directory', () => {
  test(
    'a route component edit applies in place and builds no module of a package, and a server fn edit reaches the next call',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        config: {
          // Start serves the pages, not an HTML template
          tools: { htmlPlugin: false },
          plugins: [watchSourceDirectory],
        },
        files: {
          ...appFiles,
          'src/greet.functions.ts': greetModule('V1'),
          'src/routes/index.tsx': indexRoute('MARK_LABEL_V1'),
        },
      })
      expect(server.errors).toEqual([])
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await page.page.locator('[data-testid=count]').click()
      await page.waitForText('count 1', { selector: '[data-testid=count]' })

      await server.edit({ 'src/routes/index.tsx': indexRoute('MARK_LABEL_V2') })
      expect(server.errors).toEqual([])
      await page.waitForText('MARK_LABEL_V2', {
        selector: '[data-testid=label]',
      })
      // in place: the page kept its state
      await page.waitForText('count 1', { selector: '[data-testid=count]' })
      // no module of a package is built again for it
      expect(server.rebuilt.filter((file) => !file.startsWith('src/'))).toEqual(
        [],
      )

      await server.edit({ 'src/greet.functions.ts': greetModule('V2') })
      expect(server.errors).toEqual([])
      await page.page.locator('[data-testid=call]').click()
      await page.waitForText('called MARK_HANDLER_V2', {
        selector: '[data-testid=called]',
      })
      expect(page.loads()).toBe(1)
      expect(page.errors).toEqual([])
    },
    timeout,
  )

  // Rspack reports the watched directory, and `src/lib.ts` itself (the
  // resolution of `./lib` looked for it before `src/lib/index.ts`).
  test(
    'a created file that shadows a resolution compiles the importer again',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout: 20_000,
        config: { plugins: [watchSourceDirectory] },
        files: {
          'src/lib/index.ts': `export const base = {
  handler: (fn: () => Promise<string>) => fn,
}
`,
          'src/a.ts': `import { base } from './lib'
export const a = base.handler(async () => 'MARK_A')
`,
          'src/entry.ts': `import { a } from './a'\nconsole.log(a)\n`,
        },
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_A')
      await server.edit({
        'src/lib.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
      })
      expect(server.errors).toEqual([])
      expect(await client()).not.toContain('MARK_A')
    },
    timeout,
  )
})
