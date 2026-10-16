/**
 * Rsbuild dev-server harness of the router plugin: an Rsbuild dev server
 * with the router plugin's Rspack entry (React, file-based routes in
 * `routes/`, the route tree in `routeTree.gen.ts`, code splitting on) on a
 * temporary app, through the shared Rsbuild dev-server harness
 * (`@tanstack/compiler-test-utils/rsbuild-dev-server`). The temporary apps
 * live in this directory, so their imports resolve to this package's
 * dependencies; `@tanstack/react-router` resolves to a stub (`router-stub.ts`
 * of the app), as the app is bundled but never run.
 *
 * The route generator reacts to file events of its own (a watcher of new
 * route files, and Rspack's file events of the modules it bundles): an edit
 * may cause several compiles, or none. `write()` writes files without
 * waiting, and `settle()` waits until the app files and the compiles are
 * quiet.
 */
import {
  mkdir,
  readFile,
  readdir,
  rename as renameFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { onTestFinished } from 'vitest'
import { tanstackRouter } from '../src/rspack'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { RsbuildPlugin } from '@rsbuild/core'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** An empty root route. */
const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`

/** Stub of `@tanstack/react-router`: the app is bundled, not run. */
const routerStub = `const route = (options) => ({ options, update: () => route(options) })
export const createFileRoute = () => route
export const createRootRoute = route
export const lazyRouteComponent = (importer, name = 'default') => () => importer().then((m) => m[name])
export const lazyFn = lazyRouteComponent
`

/** A chunk the last compile emitted. */
export interface EmittedChunk {
  /** Path relative to the output directory. */
  file: string
  code: string
  /** Whether the chunk is loaded with the entry (not on demand). */
  initial: boolean
}

export interface RouterRsbuildDevServer {
  server: RsbuildDevServer
  root: string
  /** Content of an app file (relative to the app root). */
  read: (relative: string) => Promise<string>
  /**
   * Writes app files (relative to the app root; `null` deletes a file)
   * without waiting for the dev server.
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Moves an app file without waiting for the dev server. */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Waits until no compile runs and neither the compiles nor the app files
   * changed for a while.
   */
  settle: () => Promise<void>
  /** `write(files)`, then `settle()`. */
  edit: (files: Record<string, string | null>) => Promise<void>
  /** Errors of the last compile. */
  errors: () => Array<string>
  /** JavaScript chunks the last compile emitted. */
  chunks: () => Promise<Array<EmittedChunk>>
}

/** How long the compiles and the app files must stay unchanged to settle. */
const quietTime = 750
/** How long settling may take. */
const settleTimeout = 20_000

/**
 * Starts an Rsbuild dev server with the router plugin (Rspack entry) on an
 * app of `files` (`routes/__root.tsx` defaults to an empty root route; the
 * entry `main.ts` imports the route tree), and resolves once it settled.
 */
export async function routerRsbuildDevServer(options: {
  files: Record<string, string>
}): Promise<RouterRsbuildDevServer> {
  let started = 0
  let done = 0
  /** JavaScript files of the chunks of the last compile, with `initial`. */
  let lastChunks: Array<{ file: string; initial: boolean }> = []
  let distPath = ''

  const server = await createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.router-rsbuild-dev-server-',
    registerCleanup: onTestFinished,
    entry: 'main.ts',
    files: {
      'routes/__root.tsx': rootRoute,
      'main.ts': `import { routeTree } from './routeTree.gen'\nconsole.log(routeTree)\n`,
      'router-stub.ts': routerStub,
      ...options.files,
    },
    plugins: ({ root }) => [
      {
        name: 'router-plugin-harness',
        setup(api) {
          api.modifyRspackConfig((config) => {
            config.resolve.alias = {
              ...(config.resolve.alias as Record<string, string>),
              '@tanstack/react-router$': path.join(root, 'router-stub.ts'),
            }
            config.plugins.push(
              tanstackRouter({
                target: 'react',
                // The Rspack plugin resolves relative paths from the working
                // directory
                routesDirectory: path.join(root, 'routes'),
                generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                autoCodeSplitting: true,
              }),
            )
          })
          api.onBeforeDevCompile(() => {
            started++
          })
          api.onDevCompileDone(({ stats, environments }) => {
            done++
            distPath = Object.values(environments)[0]!.distPath
            const json = stats.toJson({ all: false, chunks: true })
            const chunks = json.chunks ?? json.children?.[0]?.chunks ?? []
            lastChunks = chunks.flatMap((chunk) =>
              (chunk.files ?? [])
                .filter((file) => /\.[cm]?js$/.test(file))
                .map((file) => ({ file, initial: chunk.initial })),
            )
          })
        },
      } satisfies RsbuildPlugin,
    ],
  })
  const root = server.root
  const file = (relative: string) => path.join(root, relative)

  /** Latest modification time of the app files (output excluded). */
  async function lastModified() {
    let latest = 0
    const visit = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (['dist', 'node_modules', '.tanstack'].includes(entry.name)) {
          continue
        }
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          await visit(full)
        } else {
          const stats = await stat(full).catch(() => null)
          latest = Math.max(latest, stats?.mtimeMs ?? 0)
        }
      }
    }
    await visit(root)
    return latest
  }

  async function settle() {
    const deadline = Date.now() + settleTimeout
    let signature = ''
    let since = Date.now()
    for (;;) {
      const current = `${started}/${done}/${await lastModified()}`
      if (current !== signature || started !== done) {
        signature = current
        since = Date.now()
      } else if (Date.now() - since >= quietTime) {
        return
      }
      if (Date.now() > deadline) {
        throw new Error(`the Rsbuild dev server did not settle`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  async function write(files: Record<string, string | null>) {
    for (const [relative, code] of Object.entries(files)) {
      if (code === null) {
        await rm(file(relative), { force: true })
      } else {
        await mkdir(path.dirname(file(relative)), { recursive: true })
        await writeFile(file(relative), code)
      }
    }
  }

  // The route tree the generator writes before the first compile causes a
  // second one
  await settle()

  return {
    server,
    root,
    read: (relative) => readFile(file(relative), 'utf8'),
    write,
    rename: async (from, to) => {
      await mkdir(path.dirname(file(to)), { recursive: true })
      await renameFile(file(from), file(to))
    },
    settle,
    edit: async (files) => {
      await write(files)
      await settle()
    },
    errors: () => [...server.errors],
    chunks: () =>
      Promise.all(
        lastChunks.map(async (chunk) => ({
          ...chunk,
          code: await readFile(path.join(distPath, chunk.file), 'utf8'),
        })),
      ),
  }
}
