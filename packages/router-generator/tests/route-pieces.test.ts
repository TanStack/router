/**
 * Route piece files: Vue single-file components named after a route and a
 * component option (`posts.component.vue`, `__root.errorComponent.vue`, …)
 * become that option of the route, loaded lazily from the file's default
 * export. The generator never writes to them.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createApp,
  fileRoute,
  generate,
  lazyFileRoute,
  read,
  rootRoute,
} from './app'
import { routeIdOf } from './route-id'
import { loadLazyRoute, routeOptionsOf, routesOf, urlsOf } from './route-tree'

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

/** The option a piece file gives its route: its default export, lazily. */
const lazyComponent = (file: string) => ({
  kind: 'lazyRouteComponent',
  file: `routes/${file}`,
  name: 'default',
})

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
    expect(await routeOptionsOf(generatedRouteTree)).toEqual({
      __root__: {
        component: lazyComponent('__root.component.vue'),
        notFoundComponent: lazyComponent('__root.notFoundComponent.vue'),
        errorComponent: lazyComponent('__root.errorComponent.vue'),
        pendingComponent: lazyComponent('__root.pendingComponent.vue'),
      },
      '/': { component: lazyComponent('index.component.vue') },
      '/about': { component: lazyComponent('about.component.vue') },
      '/posts': {
        pendingComponent: lazyComponent('posts.pendingComponent.vue'),
        errorComponent: lazyComponent('posts.errorComponent.vue'),
        notFoundComponent: lazyComponent('posts.notFoundComponent.vue'),
      },
      '/posts/$postId': {
        component: lazyComponent('posts.$postId.component.vue'),
        errorComponent: lazyComponent('posts.$postId.errorComponent.vue'),
      },
      '/settings': {
        pendingComponent: lazyComponent('settings.pendingComponent.vue'),
      },
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
    expect(await routeOptionsOf(generatedRouteTree)).toEqual({
      __root__: { component: lazyComponent('__root.component.vue') },
      '/': { component: lazyComponent('index.component.vue') },
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
    expect((await routeOptionsOf(generatedRouteTree))['/posts']).toEqual({
      component: lazyComponent('posts.component.vue'),
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
      'src/routes/about.lazy.ts': lazyFileRoute('/about', '{}', 'vue'),
      'src/routes/posts.ts': fileRoute('/posts', '{}', 'vue'),
      'src/routes/posts.component.vue': sfc('posts'),
    })
    const { generatedRouteTree } = await generate(root, { target: 'vue' })

    expect(await routeOptionsOf(generatedRouteTree)).toEqual({
      __root__: {},
      '/about': { lazy: { file: 'routes/about.lazy.ts' } },
      '/posts': { component: lazyComponent('posts.component.vue') },
    })
    // (the lazy route the router loads is the file's `Route`)
    const lazyRoute = { options: { component: 'about' } }
    expect(
      await loadLazyRoute(generatedRouteTree, '/about', (file) =>
        file === 'routes/about.lazy.ts' ? { Route: lazyRoute } : {},
      ),
    ).toBe(lazyRoute)
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
      expect((await routeOptionsOf(generatedRouteTree))['/posts']).toEqual({
        component: lazyComponent('posts/route.component.vue'),
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
  // loads (low: the documented Vue piece is `.component.vue`).
  // Source: mutation run R4 final re-audit (G3).
  test.fails(
    'a .lazy.vue route file is the lazily loaded component of the route, or the generator warns that it is unsupported',
    async () => {
      const root = await createApp({
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/about.ts': fileRoute('/about', '{}', 'vue'),
        'src/routes/about.lazy.vue': sfc('about'),
      })
      const warnings: Array<string> = []
      vi.spyOn(console, 'warn').mockImplementation((...args) => {
        warnings.push(args.join(' '))
      })
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const { generatedRouteTree } = await generate(root, {
        target: 'vue',
        disableLogging: false,
      })
      const options = (await routeOptionsOf(generatedRouteTree))['/about']!
      if (!JSON.stringify(options).includes('about.lazy.vue')) {
        // (not wired: the user is told)
        expect(warnings.join('\n')).toContain('about.lazy.vue')
        return
      }
      const component = { name: 'AboutSfc' }
      if (options.component) {
        expect(options.component).toEqual(lazyComponent('about.lazy.vue'))
      } else {
        const lazyRoute = (await loadLazyRoute(
          generatedRouteTree,
          '/about',
          (file) =>
            file === 'routes/about.lazy.vue' ? { default: component } : {},
        )) as { options?: Record<string, unknown> } | undefined
        expect(lazyRoute?.options?.component).toBe(component)
      }
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

      expect(await routeOptionsOf(generatedRouteTree)).toEqual({
        __root__: { component: lazyComponent('__root.component.vue') },
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
      expect(await routeOptionsOf(generatedRouteTree)).toEqual({
        __root__: {},
        '/posts': {},
      })
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
      // (empty, or a single-file component: it starts with a block tag)
      expect(content === '' || content.trimStart().startsWith('<')).toBe(true)
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
