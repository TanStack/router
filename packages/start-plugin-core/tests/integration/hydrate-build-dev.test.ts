import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer } from '../dev-server'
import { startRsbuildDevServer } from '../rsbuild-dev-server'
import { moduleRequests } from '../imports'

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

  // A browser may request a chunk before its parent module was compiled in
  // this dev session (a reload after a server restart), and an edit of the
  // file must reach its chunks. The page is the app's `index.html`, rendered
  // on the client by a real page with Vite's HMR client and React Refresh.
  // Source: hydrate-when-transform.test.ts "invalidates cached Hydrate
  // source for virtual module loads" (gaps H21 / DV42; the compiler half is
  // in hydrate-boundary-forms.test.ts)
  test(
    'client: a chunk requested before its parent module renders the children, and an edit reaches it',
    async () => {
      const files = { 'src/page.tsx': page('Old') }
      // The chunk the parent module imports, learned from another server.
      const first = await startDevServer({ files })
      const [chunkUrl] = moduleRequests(
        await first.transform('/src/page.tsx'),
      ).dynamic
      await first.close()
      expect(chunkUrl).toBeDefined()

      const server = await startDevServer({
        browser: true,
        config: {
          optimizeDeps: {
            include: [
              'react',
              'react/jsx-dev-runtime',
              'react-dom',
              'react-dom/client',
              '@tanstack/react-router',
            ],
          },
        },
        plugins: [react()],
        files: {
          ...files,
          'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
          // Requests the chunk first, then the page module.
          'src/main.tsx': `import { createRoot } from 'react-dom/client'
await import(/* @vite-ignore */ ${JSON.stringify(chunkUrl)})
const { Page } = await import('./page')
createRoot(document.getElementById('app')!).render(<Page />)
`,
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('Old', { selector: '#app' })

      await server.write({ 'src/page.tsx': page('New') })

      await browser.waitForText('New', { selector: '#app' })
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev server', () => {
  // Rsbuild serves bundles: a chunk is only built through its parent's
  // import, so only the edit half of the Vite test applies.
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
      /** The output files containing each marker. */
      const locate = async () => {
        const outputs = Object.entries(await server.outputs())
        const files = (marker: string) =>
          outputs
            .filter(([, code]) => code.includes(marker))
            .map(([file]) => file)
        return {
          entry: files('console.log(Page)'),
          old: files('OLD_MARKER'),
          new: files('NEW_MARKER'),
        }
      }
      const before = await locate()
      expect(before.old.length).toBeGreaterThan(0)
      // The children are in a chunk of their own.
      expect(before.old.filter((file) => before.entry.includes(file))).toEqual(
        [],
      )

      await server.edit({ 'src/page.tsx': page('NEW_MARKER') })

      expect(server.errors).toEqual([])
      const after = await locate()
      expect(after.old).toEqual([])
      expect(after.new.length).toBeGreaterThan(0)
      expect(after.new.filter((file) => after.entry.includes(file))).toEqual([])
    },
    timeout,
  )
})
