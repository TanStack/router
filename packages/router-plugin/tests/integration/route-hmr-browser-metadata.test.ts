/** Host-delivery outcomes: real route edits reach matching, context,
 * search parsing and the document head through the public router APIs.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const inPlace = { reloaded: false, errors: [] }

const root = `import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { createPortal } from 'react-dom'
export const Route = createRootRoute({ component: Root })
function Root() {
  return <>{createPortal(<HeadContent />, document.head)}<Outlet /><Scripts /></>
}`

const item = (
  version: string,
  removed = false,
) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/items/$itemId')({
  ${
    removed
      ? ''
      : `params: { parse: ({ itemId }) => ({ itemId: itemId.${version === 'v1' ? 'toUpperCase' : 'toLowerCase'}() }) },
  validateSearch: (search) => ({ term: String(search.term ?? '').${version === 'v1' ? 'toUpperCase' : 'toLowerCase'}() }),
  beforeLoad: () => ({ label: 'context ${version}' }),
  head: () => ({ meta: [{ title: 'title ${version}' }], scripts: [{ 'data-hmr-head': '${version}', children: 'void "head ${version}"' }] }),
  scripts: () => [{ 'data-hmr-body': '${version}', children: 'void "body ${version}"' }],`
  }
  component: Page,
})
function Page() {
  const params = Route.useParams()
  const search: { term?: string } = Route.useSearch()
  const context: { label?: string } = Route.useRouteContext()
  return <p>item ${version} {params.itemId} {search.term} {context.label ?? 'no context'}</p>
}`

describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: route metadata delivered by the real host',
  (bundler) => {
    test.for([false, true])(
      'delivers matching, search, context, head and scripts edits (removal: %s)',
      { timeout: 60_000 },
      async (removed: boolean, { expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          pluginOptions: { autoCodeSplitting: false },
          files: {
            'routes/__root.tsx': root,
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })`,
            'routes/items/$itemId.tsx': item('v1'),
          },
          ready: 'home',
        })
        const fallbackTitle = await app.evaluate<string>('document.title')
        const visit = async (to: string, term?: string) => {
          await app.evaluate(
            `window.__APP_ROUTER__.navigate(${JSON.stringify({ to, search: term === undefined ? {} : { term } })})`,
          )
        }
        const documentOptions = () =>
          app.evaluate(`({
        title: document.title,
        head: [...document.head.querySelectorAll('[data-hmr-head]')].map((node) => node.getAttribute('data-hmr-head')),
        body: [...document.querySelectorAll('[data-hmr-body]')].map((node) => node.getAttribute('data-hmr-body')),
      })`)
        await visit('/items/One', 'First')
        await app.page.waitForText('item v1 ONE FIRST context v1')
        await expect.poll(documentOptions).toEqual({
          title: 'title v1',
          head: ['v1'],
          body: ['v1'],
        })
        const activeTerm = await app.evaluate<string>(
          `new URLSearchParams(location.search).get('term') ?? ''`,
        )
        // A fresh app per replacement/removal keeps this to one edit per
        // file (the Rsbuild lost-removal ruling, 2026-10-19).
        expect(
          await app.edit(
            { 'routes/items/$itemId.tsx': item('v2', removed) },
            removed
              ? `item v2 One ${activeTerm} no context`
              : 'item v2 one first context v2',
          ),
        ).toEqual(inPlace)
        await visit('/')
        await visit('/items/Two', 'Second')
        await app.page.waitForText(
          removed
            ? 'item v2 Two Second no context'
            : 'item v2 two second context v2',
        )
        await expect
          .poll(documentOptions)
          .toEqual(
            removed
              ? { title: fallbackTitle, head: [], body: [] }
              : { title: 'title v2', head: ['v2'], body: ['v2'] },
          )
        expect(app.loads()).toBe(1)
        expect(app.page.errors).toEqual([])
      },
    )

    // Bug: a replacement index export must keep the generated navigation
    // target, which differs from its fullPath's trailing slash.
    // Source: V4 red-astra-r2/05 (J3.1, G1, G9).
    // Impact: user code importing Route builds a different link after HMR.
    test(
      'an edited index export keeps its public navigation target',
      { timeout: 60_000 },
      async ({ expect, onTestFinished }: TestContext) => {
        const posts = (
          version: string,
        ) => `import { createFileRoute, Link } from '@tanstack/react-router'
export const Route = createFileRoute('/posts/')({
  loader: (): { version: string; to: string } => ({ version: '${version}', to: Route.to }),
  component: Posts,
})
function Posts() {
  const data = Route.useLoaderData()
  return <p>posts {data.version} <span data-testid="target">{data.to}</span> <Link to={data.to}>index target</Link></p>
}`
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })`,
            'routes/posts/index.tsx': posts('v1'),
          },
          ready: 'home',
        })
        await app.evaluate(`window.__APP_ROUTER__.navigate({ to: '/posts' })`)
        await app.page.waitForText('posts v1')
        expect(await app.page.page.locator('a').getAttribute('href')).toBe(
          '/posts',
        )
        expect(
          await app.edit({ 'routes/posts/index.tsx': posts('v2') }, 'posts v2'),
        ).toEqual(inPlace)
        expect(await app.page.page.locator('a').getAttribute('href')).toBe(
          '/posts',
        )
        expect(
          await app.page.page.locator('[data-testid=target]').textContent(),
        ).toBe('/posts')
      },
    )
  },
)
