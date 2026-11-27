/**
 * Scaffolds of new, empty route files (SPEC J1.3): each becomes a working
 * route of its target, checked through the real router and the target's own
 * server renderer (route-tree.ts): the root route renders its child routes,
 * every route renders something (what is free), and the files follow
 * `quoteStyle` and `semicolons`.
 */
import { describe, expect, it } from 'vitest'
import { createApp, generate, read } from './app'
import { codeStyle, routeCallOf, routeCallSpansOf } from './route-id'
import { withRouteTree } from './route-tree'

/** The text of server-rendered `html`: its text nodes, joined. */
const textOf = (html: string) =>
  html
    .replace(/<!--.*?-->/gs, '')
    .replace(/<[^>]*>/g, '')
    .trim()

// A new, empty route, lazy route or root route file is scaffolded into a
// working route for each target: the file creates its Route with the right
// constructor and id, its component renders something, and the root
// route's component renders the child route's.
describe.each(['react', 'solid', 'vue'] as const)(
  'scaffolded %s routes',
  (target) => {
    it('empty root, route and lazy route files become routes whose components render', async () => {
      const root = await createApp({
        'src/routes/__root.tsx': '',
        'src/routes/posts.tsx': '',
        'src/routes/about.lazy.tsx': '',
        'src/routes/{-$locale}/contact.tsx': '',
        'src/routes/{-$locale}/help.lazy.tsx': '',
      })
      const { generatedRouteTree } = await generate(root, { target })

      const scaffolded = async (file: string) =>
        routeCallOf(await read(root, `src/routes/${file}`))
      const pages = {
        '/posts': ['posts.tsx', '/posts', 'createFileRoute'],
        '/about': ['about.lazy.tsx', '/about', 'createLazyFileRoute'],
        '/fr/contact': [
          '{-$locale}/contact.tsx',
          '/{-$locale}/contact',
          'createFileRoute',
        ],
        '/help': [
          '{-$locale}/help.lazy.tsx',
          '/{-$locale}/help',
          'createLazyFileRoute',
        ],
      } as const
      for (const [file, id, constructor] of Object.values(pages)) {
        expect(await scaffolded(file)).toEqual({ constructor, id })
      }
      await withRouteTree(generatedRouteTree, async (tree) => {
        expect(tree.routeFiles()).toEqual({
          __root__: 'routes/__root.tsx',
          '/posts': 'routes/posts.tsx',
          '/about': null,
          '/{-$locale}/contact': 'routes/{-$locale}/contact.tsx',
          '/{-$locale}/help': null,
        })
        const rootModule = await tree.import(`${root}/src/routes/__root.tsx`)
        expect(rootModule.Route).toBe(tree.router.routeTree)
        expect(rootModule.Route.isRoot).toBe(true)
        for (const [url, [, id]] of Object.entries(pages)) {
          const route = tree.router.routesById[id]!
          await tree.router.loadRouteChunk(route)
          const page = textOf(await tree.render(route.options.component))
          expect(page, id).not.toBe('')
          // (the root route's component renders its child route's)
          expect(textOf(await tree.renderAt(url)), url).toContain(page)
        }
      })
    }, 30_000)

    // The docs (file-based-routing.md, `quoteStyle` and `semicolons`): "when
    // you first create a new route, those files will be formatted with the
    // quote style you specify" / "with semicolons". The route id argument
    // is the generator's edit of the file (SPEC J1.2: its quote character
    // is free), so it is left out.
    it.each([
      { quoteStyle: 'single', semicolons: false },
      { quoteStyle: 'double', semicolons: true },
    ] as const)(
      'scaffolded files follow quoteStyle $quoteStyle and semicolons $semicolons',
      async ({ quoteStyle, semicolons }) => {
        const files = ['__root.tsx', 'posts.tsx', 'about.lazy.tsx']
        const root = await createApp(
          Object.fromEntries(files.map((file) => [`src/routes/${file}`, ''])),
        )
        await generate(root, { target, quoteStyle, semicolons })

        for (const file of files) {
          const code = await read(root, `src/routes/${file}`)
          const style = codeStyle(code, 'route.tsx', routeCallSpansOf(code).id)
          expect(style.quotes, file).toEqual([
            quoteStyle === 'single' ? "'" : '"',
          ])
          expect(style.statements).toBeGreaterThan(0)
          expect(style.withSemicolon).toBe(semicolons ? style.statements : 0)
        }
      },
    )
  },
)
