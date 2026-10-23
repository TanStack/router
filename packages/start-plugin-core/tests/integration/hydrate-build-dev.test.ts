import { writeFile } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { describe, expect, onTestFinished, test } from 'vitest'
import { servedDirectories } from '@tanstack/compiler-test-utils/app-directory'
import { closeViteServer } from '@tanstack/compiler-test-utils/dev-server'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  clientEntryFiles,
  reportedErrors,
  startRsbuildDevServer,
} from '../rsbuild-dev-server'
import { startPlugin } from '../dev-server'
import {
  clientFixturePlugin,
  startBrowserStartDevServer,
} from './importProtection/client-pages'

const timeout = 60_000

describe('Vite dev server', () => {
  const page = (
    text: string,
  ) => `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><p>${text}</p></Hydrate>
}
`

  /** `src/main.tsx`: renders `Page` into the page, after `before`. */
  const main = (before = '') => `import { createRoot } from 'react-dom/client'
${before}const { Page } = await import('./page')
createRoot(document.getElementById('root')!).render(<Page />)
`

  // A browser may request a chunk before its parent module was compiled in
  // this dev session (a reload after a server restart), and an edit of the
  // file must reach its chunks. A real page with Vite's HMR client and React
  // Refresh renders the page module on the client (Start's whole Vite
  // plugin; the page is Vite's own HTML pipeline, `runViteClient`'s fixture
  // page). Which request carries the children is learned from the page
  // itself (the requests whose code holds them), and the dev server restarts
  // at the same root (a new Vite dev server with the same plugins on the same
  // app directory).
  // Source: hydrate-when-transform.test.ts "invalidates cached Hydrate
  // source for virtual module loads" (gaps H21 / DV42; the compiler half is
  // in hydrate-boundary-forms.test.ts)
  test(
    'client: a chunk requested before its parent module renders the children, and an edit reaches it',
    async () => {
      const optimizeDeps = {
        include: [
          'react',
          'react/jsx-dev-runtime',
          'react-dom',
          'react-dom/client',
          '@tanstack/react-router',
        ],
      }
      const server = await startBrowserStartDevServer({
        config: { optimizeDeps },
        plugins: [react()],
        files: { 'src/page.tsx': page('MARK_OLD'), 'src/main.tsx': main() },
      })
      const pageUrl = new URL('/__ip-fixture.html', server.url)
      pageUrl.searchParams.set('entry', '/src/main.tsx')

      // The requests of a page that renders the children
      const first = await openPage(pageUrl.href)
      let childRequests: Array<string>
      try {
        await first.waitForText('MARK_OLD', { selector: '#root' })
        childRequests = await first.page.evaluate<Array<string>>(`(async () => {
  const urls = [...new Set(performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => url.startsWith(location.origin + '/')))]
  const holding = []
  for (const url of urls) {
    const code = await (await fetch(url)).text()
    if (code.includes('MARK_OLD')) {
      holding.push(url.slice(location.origin.length))
    }
  }
  return holding
})()`)
      } finally {
        await first.close()
      }
      expect(childRequests).not.toEqual([])

      // The dev server restarts at the same root (the app's files and
      // dependency cache stay): the new one has compiled nothing of the app.
      // A page then requests what carries the children before the page
      // module.
      await writeFile(
        server.file('src/main.tsx'),
        main(
          childRequests
            .map(
              (url) =>
                `await import(/* @vite-ignore */ ${JSON.stringify(url)})\n`,
            )
            .join(''),
        ),
      )
      await server.stop()
      const restarted = await createServer({
        root: server.root,
        configFile: false,
        logLevel: 'error',
        server: {
          host: '127.0.0.1',
          port: 0,
          fs: { allow: await servedDirectories(server.root) },
        },
        optimizeDeps,
        plugins: [startPlugin(server.root, {}), clientFixturePlugin, react()],
      })
      onTestFinished(() => closeViteServer(restarted))
      await restarted.listen()
      const restartedUrl = new URL(
        '/__ip-fixture.html',
        restarted.resolvedUrls!.local[0],
      )
      restartedUrl.searchParams.set('entry', '/src/main.tsx')
      const browser = await openPage(restartedUrl.href, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('MARK_OLD', { selector: '#root' })

      await writeFile(server.file('src/page.tsx'), page('MARK_NEW'))

      await browser.waitForText('MARK_NEW', { selector: '#root' })
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev server', () => {
  // Rsbuild serves bundles: a chunk is only built through its parent's
  // import, so only the edit half of the Vite test applies. The page loads
  // the client entry's initial files first (Rspack's stats entrypoints,
  // `clientEntryFiles`); the children are in another file.
  test(
    'client: an edit of the file reaches the chunk of its boundary',
    async () => {
      const page = (
        marker: string,
      ) => `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><p>${marker}</p></Hydrate>
}
`
      const server = await startRsbuildDevServer({
        files: {
          'src/page.tsx': page('OLD_MARKER'),
          'src/entry.ts': `import { Page } from './page'\nconsole.log(Page)\n`,
        },
      })
      /** The output files containing each marker, and the entry's files. */
      const locate = async () => {
        const outputs = Object.entries(await server.outputs('client'))
        const files = (marker: string) =>
          outputs
            .filter(([, code]) => code.includes(marker))
            .map(([file]) => file)
        return {
          entry: clientEntryFiles(server),
          old: files('OLD_MARKER'),
          new: files('NEW_MARKER'),
        }
      }
      const before = await locate()
      expect(before.entry).not.toEqual([])
      expect(before.old.length).toBeGreaterThan(0)
      // The children are in a chunk of their own.
      expect(before.old.filter((file) => before.entry.includes(file))).toEqual(
        [],
      )

      await server.edit({ 'src/page.tsx': page('NEW_MARKER') })

      expect(reportedErrors(server)).toEqual([])
      const after = await locate()
      expect(after.old).toEqual([])
      expect(after.new.length).toBeGreaterThan(0)
      expect(after.new.filter((file) => after.entry.includes(file))).toEqual([])
    },
    timeout,
  )
})
