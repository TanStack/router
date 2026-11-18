/**
 * Router plugin options and entry points, in process (no build): see
 * `integration/plugin-options.test.ts` for the options checked through real
 * builds.
 */
import { describe, expect, test } from 'vitest'
import {
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '../src/vite'
import { TanStackRouterGeneratorEsbuild } from '../src/esbuild'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '../src/rspack'
import {
  TanStackRouterCodeSplitterWebpack,
  TanStackRouterGeneratorWebpack,
} from '../src/webpack'
import type { RouterPluginContext } from '../src/context'

// Each half takes a context made by `createRouterPluginContext()`; one it
// didn't make (written by hand, or the factory of the package's other module
// format) throws when the plugin is created, naming the factory, not when a
// bundler applies it (webpack and Rspack apply a plugin in `apply`).
describe('a context not made by createRouterPluginContext()', () => {
  const context = { routesByFile: new Map() } as unknown as RouterPluginContext
  test.each([
    ['vite generator', () => tanstackRouterGenerator({}, context)],
    ['vite code splitter', () => tanStackRouterCodeSplitter({}, context)],
    ['esbuild generator', () => TanStackRouterGeneratorEsbuild({}, context)],
    ['rspack generator', () => TanStackRouterGeneratorRspack({}, context)],
    [
      'rspack code splitter',
      () => TanStackRouterCodeSplitterRspack({}, context),
    ],
    ['webpack generator', () => TanStackRouterGeneratorWebpack({}, context)],
    [
      'webpack code splitter',
      () => TanStackRouterCodeSplitterWebpack({}, context),
    ],
  ] as const)('throws when the %s is created', (_, create) => {
    expect(create).toThrow(
      /`createRouterPluginContext\(\)` from '@tanstack\/router-plugin\/context'/,
    )
  })
})
