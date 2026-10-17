/**
 * Route piece files: Vue single-file components named after a route and a
 * component option (`posts.component.vue`, `__root.errorComponent.vue`, …)
 * become that option of the route, loaded lazily from the file's default
 * export. The generator never writes to them.
 */
import { describe, expect, test } from 'vitest'
import { createApp, fileRoute, generate, read, rootRoute } from './app'
import { routeIdOf } from './route-id'
import { routeOptionsOf, routesOf } from './route-tree'

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

  // Control: the test above with pieces of other routes too.

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
