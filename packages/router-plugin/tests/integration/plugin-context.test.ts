/**
 * The generator and the code splitter as separate plugins sharing a context
 * the app passes them (`RouterPluginContext`, the factories' second
 * parameter): a context the app builds itself, `{ routesByFile: new Map() }`
 * (what `createRouterPluginContext()` returns on main, and what its type
 * admits), works like a factory-made one. A build splits the route, and in
 * dev a route created after the start is split: the code splitter follows
 * the registry the generator assigns to the context, the router's generator
 * or the app's own (which assigns `context.routesByFile` itself).
 */
import { describe, expect, test } from 'vitest'
import { Generator, getConfig } from '@tanstack/router-generator'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '../../src/rspack'
import {
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '../../src/vite'
import {
  TanStackRouterCodeSplitterWebpack,
  TanStackRouterGeneratorWebpack,
} from '../../src/webpack'
import { build, routeApp } from '../build-harness'
import {
  expectLoadedOnNavigation,
  generatorDevApp,
  route,
} from '../generator-dev-app'
import type { Plugin } from 'vite'
import type { GeneratorEvent } from '@tanstack/router-generator'
import type { RouterPluginContext } from '../../src/context'
import type { RouterPluginOptions } from '../build-harness'
import type { Config } from '../../src/vite'

const timeout = 60_000

const handBuilt = (): RouterPluginContext => ({ routesByFile: new Map() })

const separatePlugins = {
  vite: (config: RouterPluginOptions, context: RouterPluginContext) => [
    tanstackRouterGenerator(config as never, context),
    tanStackRouterCodeSplitter(config as never, context),
  ],
  webpack: (config: RouterPluginOptions, context: RouterPluginContext) => [
    TanStackRouterGeneratorWebpack(config as never, context),
    TanStackRouterCodeSplitterWebpack(config as never, context),
  ],
  rspack: (config: RouterPluginOptions, context: RouterPluginContext) => [
    TanStackRouterGeneratorRspack(config as never, context),
    TanStackRouterCodeSplitterRspack(config as never, context),
  ],
}

describe.each(['vite', 'webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    'a build with a hand-built context splits the route',
    async () => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(
          `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_PAGE' })
`,
          { env: 'client' },
        ),
        routerPlugins: (config) =>
          separatePlugins[bundler](config, handBuilt()),
      })
      expect(app.where('MARK_PAGE')).toBe('lazy')
    },
    timeout,
  )
})

/**
 * The app's own generator plugin: runs the router's `Generator` and assigns
 * its registry to the context after each run (as `createRouterPluginContext`
 * users with their own generator do).
 */
function appGenerator(
  options: Partial<Config>,
  context: RouterPluginContext,
): Plugin {
  let generator: Generator | undefined
  const generate = async (event: GeneratorEvent) => {
    await generator!.run(event)
    context.routesByFile = generator!.getRoutesByFileMap()
  }
  return {
    name: 'app-route-generator',
    configResolved(config) {
      generator = new Generator({
        config: getConfig(options, config.root),
        root: config.root,
      })
    },
    buildStart: () => generate({ type: 'rerun' }),
    watchChange: (path, change) => generate({ type: change.event, path }),
  }
}

const devGenerators = {
  'the router generator': (config: Partial<Config>) => {
    const context = handBuilt()
    return [
      tanstackRouterGenerator(config, context),
      tanStackRouterCodeSplitter(config, context),
    ]
  },
  "the app's own generator": (config: Partial<Config>) => {
    const context = handBuilt()
    return [
      appGenerator(config, context),
      tanStackRouterCodeSplitter(config, context),
    ]
  },
}

test.each(Object.keys(devGenerators) as Array<keyof typeof devGenerators>)(
  'in Vite dev with a hand-built context and %s, a route created after the start is split',
  async (generator) => {
    const app = await generatorDevApp({
      bundler: 'vite',
      files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      routerPlugins: devGenerators[generator],
    })
    await app.edit({ 'routes/posts.tsx': route('/posts', 'MARK_POSTS') })
    await expectLoadedOnNavigation(
      app,
      { pathname: '/', shows: 'MARK_INDEX' },
      '/posts',
      'MARK_POSTS',
    )
    expect(app.errors()).toEqual([])
  },
  timeout,
)
