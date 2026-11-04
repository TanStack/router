/**
 * Start's plugins as an app configures them: `tanstackStart(options)` of the
 * built framework package (`@tanstack/<framework>-start/plugin/vite` or
 * `/plugin/rsbuild`), resolved through the package's `exports` as an app's
 * `vite.config.ts` or `rsbuild.config.ts` resolves it. The framework package
 * passes Start's plugin its own options (framework, default entries, server
 * fn provider) and adds its own configuration (React's `dedupe`, externals
 * and pre-bundling, Solid's resolve conditions); the harnesses never pass
 * Start's plugin anything an app cannot.
 *
 * A harness gives an app its entries through Start's documented options
 * (`client.entry`, `server.entry`, relative to the source directory), and
 * only those the app does not have itself (`src/client.*`, `src/server.*`):
 * Start then uses the app's own, as in any app.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveModulePath } from 'exsolve'
import { workspacePackage } from '@tanstack/compiler-test-utils/workspace-packages'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { PluginOption } from 'vite'

/** The Start framework packages an app can use. */
export type StartFramework = 'react' | 'solid' | 'vue'

/**
 * The options of `tanstackStart()` (the documented Start plugin options), as
 * a test passes them.
 */
export type StartPluginOptions = Record<string, unknown>

export const startPackages: Record<StartFramework, string> = {
  react: '@tanstack/react-start',
  solid: '@tanstack/solid-start',
  vue: '@tanstack/vue-start',
}

type ViteFactory = (options?: StartPluginOptions) => Array<PluginOption>
type RsbuildFactory = (options?: StartPluginOptions) => RsbuildPlugin

const factories = new Map<string, Promise<unknown>>()

/**
 * `tanstackStart` of the built `@tanstack/<framework>-start/plugin/<bundler>`,
 * resolved through the package's `exports`.
 */
function factory(
  framework: StartFramework,
  bundler: 'vite' | 'rsbuild',
): Promise<unknown> {
  const key = `${framework}/${bundler}`
  let loaded = factories.get(key)
  if (!loaded) {
    const pkg = startPackages[framework]
    loaded = import(
      pathToFileURL(
        resolveModulePath(`${pkg}/plugin/${bundler}`, {
          from: `${workspacePackage(pkg)}/`,
          conditions: ['import', 'node', 'default'],
        }),
      ).href
    ).then((module: { tanstackStart: unknown }) => module.tanstackStart)
    factories.set(key, loaded)
  }
  return loaded
}

/** `tanstackStart` of `@tanstack/<framework>-start/plugin/vite`. */
export function startPluginFactory(
  framework: StartFramework,
): Promise<ViteFactory> {
  return factory(framework, 'vite') as Promise<ViteFactory>
}

/** `tanstackStart` of `@tanstack/<framework>-start/plugin/rsbuild`. */
export function startRsbuildPluginFactory(
  framework: StartFramework,
): Promise<RsbuildFactory> {
  return factory(framework, 'rsbuild') as Promise<RsbuildFactory>
}

/** Entries a harness gives an app that has none of its own (absolute). */
export interface HarnessEntries {
  client?: string
  server?: string
}

/**
 * The app's Start options with the harness's entries (`client.entry`,
 * `server.entry`, relative to the app's source directory) where neither the
 * test's options nor the app (a `<srcDirectory>/client.*` or `server.*`
 * file, which Start finds by itself) give one.
 */
export function withHarnessEntries(
  root: string,
  start: StartPluginOptions,
  entries: HarnessEntries,
): StartPluginOptions {
  const srcDir = path.resolve(
    root,
    typeof start.srcDirectory === 'string' ? start.srcDirectory : 'src',
  )
  const own = existsSync(srcDir) ? readdirSync(srcDir) : []
  const options: StartPluginOptions = { ...start }
  for (const name of ['client', 'server'] as const) {
    const entry = entries[name]
    const configured = start[name] as { entry?: unknown } | undefined
    if (
      !entry ||
      configured?.entry !== undefined ||
      own.some((file) => new RegExp(`^${name}\\.[cm]?[jt]sx?$`).test(file))
    ) {
      continue
    }
    options[name] = {
      ...configured,
      entry: path.relative(srcDir, entry),
    }
  }
  return options
}

/**
 * Start's Vite plugins of an app: `tanstackStart()` of the framework
 * package, with the harness's entries where the app has none
 * (`withHarnessEntries`).
 */
export async function startPlugins(
  framework: StartFramework,
  root: string,
  start: StartPluginOptions = {},
  entries: HarnessEntries = {},
): Promise<Array<PluginOption>> {
  const tanstackStart = await startPluginFactory(framework)
  return tanstackStart(withHarnessEntries(root, start, entries))
}

/** Start's Rsbuild plugin of an app (see `startPlugins`). */
export async function startRsbuildPlugin(
  framework: StartFramework,
  root: string,
  start: StartPluginOptions = {},
  entries: HarnessEntries = {},
): Promise<RsbuildPlugin> {
  const tanstackStart = await startRsbuildPluginFactory(framework)
  return tanstackStart(withHarnessEntries(root, start, entries))
}

/**
 * The file a package's `package.json` exports for `subpath` (its `import`
 * condition), as Node resolves an app's import of it.
 */
function exportedFile(root: string, subpath: string): string {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    exports: Record<string, string | { import?: unknown; default?: unknown }>
  }
  const entry = manifest.exports[subpath]!
  const target =
    typeof entry === 'string'
      ? entry
      : typeof entry.import === 'string'
        ? entry.import
        : ((entry.import as { default?: string } | undefined)?.default ??
          (entry.default as string))
  return path.join(root, target)
}

/** A dependency of `@tanstack/react-start-rsc`, by its package root. */
export function rscDependency(name: string): string {
  const rscPackage = workspacePackage('@tanstack/react-start-rsc')
  return path.dirname(
    createRequire(path.join(rscPackage, 'package.json')).resolve(
      `${name}/package.json`,
    ),
  )
}

/**
 * Vite's RSC plugin (`@vitejs/plugin-rsc`, as `@tanstack/react-start-rsc`
 * installs it).
 */
export async function rscPluginFactory(): Promise<() => PluginOption> {
  const { default: rsc } = (await import(
    pathToFileURL(exportedFile(rscDependency('@vitejs/plugin-rsc'), '.')).href
  )) as { default: () => PluginOption }
  return rsc
}
