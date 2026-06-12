import { createRequire } from 'node:module'
import { createMetroCompiler } from '@tanstack/start-plugin-core/metro'
import type {
  CreateMetroCompilerOptions,
  MetroCompilerHandle,
} from '@tanstack/start-plugin-core/metro'

export type CreateReactStartMetroCompilerOptions = Omit<
  CreateMetroCompilerOptions,
  'framework'
>

/**
 * Create a TanStack Start compiler for a React Native client built with Metro.
 *
 * Wraps `createMetroCompiler` with `framework: 'react'`. Returns a handle
 * exposing `compile`, `invalidate`, and `getServerFns` — the foundation a
 * Metro transformer wrapper (or custom integration) calls per source file.
 *
 * The Start *server* must be deployed separately (a normal Vite or Rsbuild
 * Start build). Server function IDs match across the two builds because
 * `generateFunctionId` is deterministic given the same source + root.
 *
 * @example
 * ```ts
 * import { createReactStartMetroCompiler } from '@tanstack/react-start/plugin/metro'
 *
 * const start = createReactStartMetroCompiler({ root: process.cwd() })
 * const result = await start.compile({ id, code })
 * ```
 */
export function createReactStartMetroCompiler(
  options: CreateReactStartMetroCompilerOptions,
): MetroCompilerHandle {
  return createMetroCompiler({
    framework: 'react',
    ...options,
  })
}

export interface WithTanStackStartOptions {
  /** Project root. Defaults to `process.cwd()`. */
  root?: string
  /**
   * Base URL of the deployed TanStack Start server. Replaces references to
   * `process.env.TSS_SERVER_FN_BASE` and `import.meta.env.TSS_SERVER_FN_BASE`
   * in transformed source so client RPC stubs target the right origin.
   *
   * @example 'https://api.example.com'
   */
  serverFnBase?: string
  /**
   * Override the upstream Metro Babel transformer (the one our wrapper
   * delegates to). Defaults to `@react-native/metro-babel-transformer`.
   */
  originalTransformerPath?: string
}

interface MetroLikeConfig {
  transformer?: {
    babelTransformerPath?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function normalizeServerFnBase(serverFnBase: string | undefined) {
  if (!serverFnBase) return undefined

  const withTrailingSlash = serverFnBase.endsWith('/')
    ? serverFnBase
    : `${serverFnBase}/`

  if (withTrailingSlash.endsWith('/_serverFn/')) {
    return withTrailingSlash
  }

  return `${withTrailingSlash}_serverFn/`
}

/**
 * Wrap a Metro config so TanStack Start `createServerFn` / `createIsomorphicFn`
 * / `createMiddleware` / `createServerOnlyFn` / `createClientOnlyFn` calls in
 * your React Native client get rewritten to RPC stubs at bundle time.
 *
 * The actual Start server (the thing that hosts your `createServerFn` handlers)
 * must be deployed separately — typically a Vite or Rsbuild Start build.
 * Function IDs match across the two builds because they're deterministic given
 * the same source tree + project root.
 *
 * @example
 * ```js
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config')
 * const { withTanStackRouter } = require('@tanstack/router-plugin/metro')
 * const { withTanStackStart } = require('@tanstack/react-start/plugin/metro')
 *
 * const config = getDefaultConfig(__dirname)
 * module.exports = withTanStackRouter(
 *   withTanStackStart(config, { serverFnBase: 'https://api.example.com' }),
 * )
 * ```
 */
export async function withTanStackStart<T extends MetroLikeConfig>(
  metroConfig: T | Promise<T>,
  options: WithTanStackStartOptions = {},
): Promise<T> {
  const config = await metroConfig
  const root = options.root ?? process.cwd()

  const require = createRequire(import.meta.url)
  const transformerPath =
    require.resolve('@tanstack/start-plugin-core/metro/transformer')
  const transformer = require(transformerPath) as {
    setup: (opts: {
      root: string
      framework: 'react'
      originalTransformerPath?: string
      serverFnBase?: string
    }) => void
  }

  const originalTransformerPath =
    options.originalTransformerPath ?? config.transformer?.babelTransformerPath

  transformer.setup({
    root,
    framework: 'react',
    originalTransformerPath,
    serverFnBase: normalizeServerFnBase(options.serverFnBase),
  })

  return {
    ...config,
    transformer: {
      ...(config.transformer ?? {}),
      babelTransformerPath: transformerPath,
    },
  }
}

export type {
  MetroCompilerHandle,
  MetroCompileResult,
  CreateMetroCompilerOptions,
} from '@tanstack/start-plugin-core/metro'
