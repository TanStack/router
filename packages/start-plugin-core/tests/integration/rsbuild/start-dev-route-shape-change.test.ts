/**
 * Route HMR in a React Start app on Rsbuild dev whose root route renders the
 * document: four saves that each change a loader's data shape and the
 * component reading it (SPEC J3.3), each waited for until the page shows it
 * and its client effect ran. With a route error component every save shows
 * in place; with only the router's global boundary, which replaced the
 * document, each save reloads the page once and shows. Vite and Solid, Vue:
 * ../start-dev-route-shape-change.test.ts.
 */
import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, test } from 'vitest'
import { openTestPage } from '../../test-close'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { reactApp } from '../hydrate-dev-edits'

const timeout = 150_000

const index = (n: number, errorComponent: boolean) =>
  `import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => ({ k${n}: { text: 'home-v${n}' } }), component: Home${errorComponent ? `, errorComponent: () => <p data-probe="error">route-error</p>` : ''} })
function Home() {
  useEffect(() => { (window as any).__effect = ${n} }, [])
  const data: any = Route.useLoaderData()
  return <p data-probe="home">{data.k${n}.text}</p>
}
`

describe.each([true, false])(
  'Rsbuild dev, React Start with a document shell, route error component: %s',
  (errorComponent) => {
    test(
      'four saves that change the loader data shape and the component reading it',
      async () => {
        const server = await startRsbuildStartDevServer({
          hmr: true,
          browser: true,
          config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
          files: {
            ...reactApp,
            'src/routes/index.tsx': index(1, errorComponent),
          },
        })
        const browser = await openTestPage(server.url!)
        const shows = async (n: number) => {
          await browser.waitForText(`home-v${n}`, {
            selector: '[data-probe=home]',
            timeout: 20_000,
          })
          await browser.page.waitForFunction(
            (v) => (window as any).__effect === v,
            n,
          )
        }
        await shows(1)
        for (const n of [2, 3, 4, 5]) {
          await server.edit({
            'src/routes/index.tsx': index(n, errorComponent),
          })
          await shows(n)
          expect(browser.loads()).toBe(errorComponent ? 1 : n)
        }
      },
      timeout,
    )
  },
)
