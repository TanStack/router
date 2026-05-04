import { execFileSync } from 'node:child_process'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import chokidar from 'chokidar'
import { Generator } from '@tanstack/router-generator'
import { getConfig } from './core/config'
import type { GeneratorEvent } from '@tanstack/router-generator'
import type { Config } from './core/config'

const PLUGIN_NAME = '@tanstack/router-plugin/metro'

export interface WithTanStackRouterOptions {
  /**
   * Inline TanStack Router config. Merged with `tsr.config.json` at the
   * project root if present.
   */
  config?: Partial<Config> | (() => Partial<Config>)
  /**
   * Project root used to resolve relative paths (e.g. `routesDirectory`).
   * Defaults to `process.cwd()`.
   */
  root?: string
  /**
   * Whether to watch the routes directory and regenerate on changes.
   * Defaults to `process.env.NODE_ENV !== 'production'`.
   */
  watch?: boolean
  /**
   * Whether to run an initial blocking route generation when the metro
   * config is loaded. Defaults to `true`. Disable if you generate routes
   * out-of-band (e.g. as a CI step) and want metro config load to be fast.
   */
  initialGenerate?: boolean
}

/**
 * Wrap a Metro config with TanStack Router file-based routing support.
 *
 * - **Synchronous**: returns the (unmodified) config immediately, so it
 *   composes cleanly with other Metro config wrappers and works with Expo's
 *   Metro CLI (which reads config fields synchronously).
 * - **Initial generation**: runs `@tanstack/router-cli generate` as a
 *   blocking subprocess so the route tree exists before Metro starts
 *   bundling. Disable via `{ initialGenerate: false }` if you generate
 *   routes elsewhere.
 * - **Watch mode**: in dev (`NODE_ENV !== 'production'`) starts a chokidar
 *   watcher on the routes directory; route file changes regenerate the
 *   tree, and Metro's own watcher then triggers a reload.
 *
 * @example
 * ```js
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config')
 * const { withTanStackRouter } = require('@tanstack/router-plugin/metro')
 *
 * const config = getDefaultConfig(__dirname)
 * module.exports = withTanStackRouter(config)
 * ```
 */
export function withTanStackRouter<T>(
  metroConfig: T,
  options: WithTanStackRouterOptions = {},
): T {
  const root = options.root ?? process.cwd()
  const inline =
    typeof options.config === 'function'
      ? options.config()
      : (options.config ?? {})
  const userConfig = getConfig(inline, root)

  if (userConfig.enableRouteGeneration === false) {
    return metroConfig
  }

  if (options.initialGenerate !== false) {
    runInitialGenerateSync(root)
  }

  const shouldWatch = options.watch ?? process.env.NODE_ENV !== 'production'
  if (shouldWatch) {
    startWatcher(root, userConfig)
  }

  return metroConfig
}

export default withTanStackRouter

function runInitialGenerateSync(root: string): void {
  let cliBin: string
  try {
    const pkgJson = require.resolve('@tanstack/router-cli/package.json', {
      paths: [root, __dirname],
    })
    cliBin = join(dirname(pkgJson), 'bin', 'tsr.cjs')
  } catch {
    console.error(
      `[${PLUGIN_NAME}] Could not resolve @tanstack/router-cli — skipping initial generate. Install it as a dev dep, or pass { initialGenerate: false }.`,
    )
    return
  }
  try {
    execFileSync(process.execPath, [cliBin, 'generate'], {
      cwd: root,
      stdio: 'pipe',
    })
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.() ?? ''
    console.error(
      `[${PLUGIN_NAME}] Initial route generation failed:\n${stderr || err}`,
    )
  }
}

function startWatcher(root: string, userConfig: Config): void {
  const generator = new Generator({ config: userConfig, root })
  const generate = async (event?: GeneratorEvent) => {
    try {
      await generator.run(event)
    } catch (err) {
      console.error(`[${PLUGIN_NAME}]`, err)
    }
  }

  const routesDirectoryPath = isAbsolute(userConfig.routesDirectory)
    ? userConfig.routesDirectory
    : join(root, userConfig.routesDirectory)

  console.info(
    `[${PLUGIN_NAME}] Watching routes (${userConfig.routesDirectory})`,
  )

  const watcher = chokidar.watch(routesDirectoryPath, { ignoreInitial: true })
  watcher
    .on('add', (file) => generate({ path: normalize(file), type: 'create' }))
    .on('change', (file) =>
      generate({ path: normalize(file), type: 'update' }),
    )
    .on('unlink', (file) =>
      generate({ path: normalize(file), type: 'delete' }),
    )

  const cleanup = () => {
    void watcher.close()
  }
  process.once('exit', cleanup)
  process.once('SIGINT', () => {
    cleanup()
    process.exit(0)
  })
  process.once('SIGTERM', () => {
    cleanup()
    process.exit(0)
  })
}
