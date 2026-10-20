/**
 * Route piece files: Vue single-file components named after a route and a
 * component option (`posts.component.vue`, `__root.errorComponent.vue`, …)
 * become that option of the route, loaded lazily from the file's default
 * export. The generator never writes to them. Checked with the real router
 * and real Vue: each option, once the router loaded the route, renders the
 * single-file component (compiled by the Vue plugin of a real Vite server).
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createApp, fileRoute, generate, read, rootRoute } from './app'
import { routeIdOf } from './route-id'
import { evaluateModule, routesOf, urlsOf, withRouteTree } from './route-tree'

afterEach(() => {
  vi.restoreAllMocks()
})

/** A Vue single-file component rendering `text`. */
const sfc = (text: string) => `<script setup lang="ts">
const label = '${text}'
</script>

<template>
  <p>{{ label }}</p>
</template>
`

/** The texts of the `<p>` elements of server-rendered `html`, joined. */
const textOf = (html: string) =>
  [...html.matchAll(/<p>([^<]*)<\/p>/g)].map((match) => match[1]).join(' ')

/** The component options a route may have. */
const componentOptions = [
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
] as const

/**
 * The text each component option of each route renders, by route id, once
 * the router loaded the route (its lazy route file and components). Piece
 * files load lazily: the app that loaded the route tree has loaded none of
 * them before a route is loaded.
 */
function piecesOf(treeFile: string) {
  return withRouteTree(treeFile, async ({ router, render, loadedFiles }) => {
    expect(
      loadedFiles().filter((file) => file.endsWith('.vue')),
      'the piece files loaded with the route tree, before any route is loaded',
    ).toEqual([])
    const pieces: Record<string, Record<string, string>> = {}
    for (const route of Object.values(router.routesById)) {
      await router.loadRouteChunk(route)
      pieces[route.id] = {}
      for (const option of componentOptions) {
        if (route.options[option]) {
          pieces[route.id]![option] = textOf(
            await render(route.options[option]),
          )
        }
      }
    }
    return pieces
  })
}

describe('Vue piece files', () => {
  test('pieces of routes and of the root route are lazy components of their default export, and are left untouched', async () => {
    const files = {
      'src/routes/__root.ts': rootRoute('vue'),
      'src/routes/__root.component.vue': sfc('root'),
      'src/routes/__root.notFoundComponent.vue': sfc('root not found'),
      'src/routes/__root.errorComponent.vue': sfc('root error'),
      'src/routes/__root.pendingComponent.vue': sfc('root pending'),
      'src/routes/index.ts': fileRoute('/', '{}', 'vue'),
      'src/routes/index.component.vue': sfc('index'),
      'src/routes/posts.ts': fileRoute('/posts', '{}', 'vue'),
      'src/routes/posts.pendingComponent.vue': sfc('posts pending'),
      'src/routes/posts.errorComponent.vue': sfc('posts error'),
      'src/routes/posts.notFoundComponent.vue': sfc('posts not found'),
      'src/routes/posts.$postId.ts': fileRoute('/posts/$postId', '{}', 'vue'),
      'src/routes/posts.$postId.component.vue': sfc('post'),
      'src/routes/posts.$postId.errorComponent.vue': sfc('post error'),
      'src/routes/settings.ts': fileRoute('/settings', '{}', 'vue'),
      'src/routes/settings.pendingComponent.vue': sfc('settings pending'),
      // A route with only a piece file and no route file
      'src/routes/about.component.vue': sfc('about'),
    }
    const root = await createApp(files)
    const { generatedRouteTree } = await generate(root, { target: 'vue' })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.ts',
      '/': 'routes/index.ts',
      '/about': null,
      '/posts': 'routes/posts.ts',
      '/posts/$postId': 'routes/posts.$postId.ts',
      '/settings': 'routes/settings.ts',
    })
    expect(await piecesOf(generatedRouteTree)).toEqual({
      __root__: {
        component: 'root',
        notFoundComponent: 'root not found',
        errorComponent: 'root error',
        pendingComponent: 'root pending',
      },
      '/': { component: 'index' },
      '/about': { component: 'about' },
      '/posts': {
        pendingComponent: 'posts pending',
        errorComponent: 'posts error',
        notFoundComponent: 'posts not found',
      },
      '/posts/$postId': { component: 'post', errorComponent: 'post error' },
      '/settings': { pendingComponent: 'settings pending' },
    })
    for (const [file, content] of Object.entries(files)) {
      expect(await read(root, file)).toBe(content)
    }
  })

  test('with disableTypes, pieces of routes and of the root route are lazy components in a JavaScript route tree', async () => {
    const root = await createApp({
      'src/routes/__root.js': rootRoute('vue'),
      'src/routes/__root.component.vue': sfc('root'),
      'src/routes/index.js': fileRoute('/', '{}', 'vue'),
      'src/routes/index.component.vue': sfc('index'),
    })
    const { generatedRouteTree } = await generate(root, {
      target: 'vue',
      disableTypes: true,
    })

    expect(generatedRouteTree.endsWith('.js')).toBe(true)
    expect(await piecesOf(generatedRouteTree)).toEqual({
      __root__: { component: 'root' },
      '/': { component: 'index' },
    })
  })

  test('a component piece of a route with child routes leaves the children under the route', async () => {
    const root = await createApp({
      'src/routes/__root.ts': rootRoute('vue'),
      'src/routes/posts.ts': fileRoute('/posts', '{}', 'vue'),
      'src/routes/posts.component.vue': sfc('posts'),
      'src/routes/posts.$postId.ts': fileRoute('/posts/$postId', '{}', 'vue'),
      'src/routes/posts.$postId.edit.ts': fileRoute(
        '/posts/$postId/edit',
        '{}',
        'vue',
      ),
    })
    const { generatedRouteTree } = await generate(root, { target: 'vue' })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.ts',
      '/posts': 'routes/posts.ts',
      '/posts/$postId': 'routes/posts.$postId.ts',
      '/posts/$postId/edit': 'routes/posts.$postId.edit.ts',
    })
    expect((await piecesOf(generatedRouteTree))['/posts']).toEqual({
      component: 'posts',
    })
  })

  // A `.lazy` route file is a piece of its route too, and may come first.
  // Source: r5-gaps N4 (rg:414: the scan for the pieces the route tree needs
  // `lazyRouteComponent` for stopped at the first route with any piece, so
  // the tree called it without importing it).
  test('a route with a lazy route file next to a route with a component piece both get their lazy parts', async () => {
    const root = await createApp({
      'src/routes/__root.ts': rootRoute('vue'),
      'src/routes/about.ts': fileRoute('/about', '{}', 'vue'),
      'src/routes/about.lazy.ts': `import { h } from 'vue'
import { createLazyFileRoute } from '@tanstack/vue-router'

export const Route = createLazyFileRoute('/about')({
  component: () => h('p', 'about lazy'),
})
`,
      'src/routes/posts.ts': fileRoute('/posts', '{}', 'vue'),
      'src/routes/posts.component.vue': sfc('posts'),
    })
    const { generatedRouteTree } = await generate(root, { target: 'vue' })

    expect(await piecesOf(generatedRouteTree)).toEqual({
      __root__: {},
      '/about': { component: 'about lazy' },
      '/posts': { component: 'posts' },
    })
  })

  // Bug: the route file of a directory route is `route.ts` (the default
  // `routeToken`), but a piece file next to it (`posts/route.component.vue`)
  // keeps the `route` segment: route nodes strip only one suffix per file
  // (src/filesystem/physical/getRouteNodes.ts, `suffixToStrip ??
  // lastRouteSegment`), the piece suffix here, so the piece belongs to a
  // route `/posts/route` of its own. Flat files (`posts.component.vue`) and
  // index pieces (`posts.index.component.vue`) work.
  // Impact: in a Vue app with directory routes, the layout's component
  // piece is a page at `/posts/route` instead of the `/posts` layout's
  // component.
  // Source: mutation run R4 final re-audit (G2).
  test.fails(
    'a component piece of a directory route (route.component.vue) is the component of the route',
    async () => {
      const root = await createApp({
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/posts/route.ts': fileRoute('/posts', '{}', 'vue'),
        'src/routes/posts/route.component.vue': sfc('posts'),
        'src/routes/posts/index.ts': fileRoute('/posts/', '{}', 'vue'),
      })
      const { generatedRouteTree } = await generate(root, { target: 'vue' })

      expect(await urlsOf(generatedRouteTree)).toEqual({
        __root__: '/',
        '/posts': '/posts',
        '/posts/': '/posts/',
      })
      expect((await piecesOf(generatedRouteTree))['/posts']).toEqual({
        component: 'posts',
      })
    },
  )

  // Bug: a `.lazy.vue` route file is wired as the route's lazy route
  // (`.lazy(() => import('./routes/about.lazy.vue').then((d) => d.default))`,
  // src/generator.ts, the `lazyComponentNode` branch), but a single-file
  // component's default export is a component, not a lazy route: the router
  // reads the lazy route's `options` (router-core load-client.ts), which the
  // component does not have, so loading the route fails.
  // Impact: a Vue app with a `.lazy.vue` route file fails when the route
  // loads (low: the documented Vue piece is `.component.vue`). A
  // `.lazy.vue` file is the lazily loaded component of its route (ruling
  // 2026-10-18, SPEC J1.17).
  // Source: mutation run R4 final re-audit (G3).
  test.fails(
    'a .lazy.vue route file is the lazily loaded component of the route',
    async () => {
      const root = await createApp({
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/about.ts': fileRoute('/about', '{}', 'vue'),
        'src/routes/about.lazy.vue': sfc('about'),
      })
      const { generatedRouteTree } = await generate(root, { target: 'vue' })

      await withRouteTree(generatedRouteTree, async (tree) => {
        // (lazily: the app does not load it before the route renders)
        expect(tree.loadedFiles()).not.toContain('routes/about.lazy.vue')
        expect(textOf(await tree.renderAt('/about'))).toBe('about')
      })
    },
  )

  // Bug: when only the root route has piece files, the route tree calls
  // `lazyRouteComponent` without importing it, and fails to load with
  // "ReferenceError: lazyRouteComponent is not defined".
  // Source: src/generator.ts:652-680 (the runtime import is added for the
  // pieces of non-root routes only).
  // Impact: a Vue app whose only piece file is, e.g., `__root.component.vue`
  // fails to start.
  test.fails(
    'pieces of the root route only are lazy components of their default export',
    async () => {
      const root = await createApp({
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/__root.component.vue': sfc('root'),
        'src/routes/index.ts': fileRoute('/', '{}', 'vue'),
      })
      const { generatedRouteTree } = await generate(root, { target: 'vue' })

      expect(await piecesOf(generatedRouteTree)).toEqual({
        __root__: { component: 'root' },
        '/': {},
      })
    },
  )
})

describe('empty files', () => {
  test.each([
    'posts.component.vue',
    'posts.errorComponent.vue',
    'posts.pendingComponent.vue',
    'posts.notFoundComponent.vue',
    'posts.loader.ts',
  ])(
    'an empty piece file %s is left empty and unused, and the routes still generate',
    async (file) => {
      const root = await createApp({
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/posts.ts': fileRoute('/posts', '{}', 'vue'),
        [`src/routes/${file}`]: '',
      })
      const { generatedRouteTree } = await generate(root, { target: 'vue' })

      expect(await read(root, `src/routes/${file}`)).toBe('')
      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.ts',
        '/posts': 'routes/posts.ts',
      })
      // The routes load and render (whatever the generator did with the
      // empty file: an attached piece must load and render too).
      await piecesOf(generatedRouteTree)
      await withRouteTree(generatedRouteTree, ({ renderAt }) =>
        renderAt('/posts'),
      )
    },
  )

  // Bug: an empty `.lazy.vue` file is scaffolded like a `.lazy.tsx` file:
  // the generator writes TypeScript route code (`import { h } from 'vue'`,
  // `createLazyFileRoute(...)`) into the single-file component, which no
  // Vue compiler accepts (src/generator.ts, scaffolding of empty route
  // files; the other Vue pieces are left empty, the rows above).
  // Impact: creating an empty `about.lazy.vue` in a Vue app turns it into a
  // file that fails to compile (low).
  // Source: mutation run R4 final re-audit (G3).
  test.fails(
    'an empty .lazy.vue route file is not filled with TypeScript route code',
    async () => {
      const root = await createApp({
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/about.ts': fileRoute('/about', '{}', 'vue'),
        'src/routes/about.lazy.vue': '',
      })
      await generate(root, { target: 'vue' })

      const content = await read(root, 'src/routes/about.lazy.vue')
      // Empty, or a single-file component the Vue plugin compiles to a
      // component that renders.
      if (content !== '') {
        const { exports } = await evaluateModule(content, 'about.lazy.vue')
        await renderToString(createSSRApp(exports.default))
      }
    },
  )

  test('an empty pathless layout file is scaffolded and added to the route tree', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/_auth.tsx': '',
    })
    const { generatedRouteTree } = await generate(root)

    expect(await routeIdOf(await read(root, 'src/routes/_auth.tsx'))).toBe(
      '/_auth',
    )
    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/_auth': 'routes/_auth.tsx',
    })
  })
})
