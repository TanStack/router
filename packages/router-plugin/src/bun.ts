/**
 * Bun bundler adapter for @tanstack/router-plugin.
 *
 * Prefer the native Bun code-splitter for `Bun.build({ plugins })`.
 * Esbuild-shaped factories remain available for tools that accept esbuild plugins.
 */
export { configSchema } from './core/config'
export {
  createBunRouterCodeSplitterPlugin,
  createBunRouterCodeSplitterRuntime,
} from './core/bun-code-splitter-plugin'
export type {
  BunCodeSplitterOptions,
  BunCodeSplitterRuntime,
} from './core/bun-code-splitter-plugin'
export { createRouterPluginContext } from './core/router-plugin-context'

export {
  TanStackRouterGeneratorEsbuild as TanStackRouterGeneratorBun,
  TanStackRouterCodeSplitterEsbuild as TanStackRouterCodeSplitterEsbuildBun,
  TanStackRouterEsbuild as TanStackRouterBun,
  tanstackRouter,
  TanStackRouterEsbuild as default,
} from './esbuild'

export type { Config, CodeSplittingOptions, RouterPluginContext } from './esbuild'
