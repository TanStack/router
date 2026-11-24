import type { Rspack } from '@rsbuild/core'

/** An app's worker plugin (`workerPluginOf`). */
export interface WorkerPluginOptions {
  /** The worker's name: its child compiler's, and its file (`<name>.js`). Default `worker`. */
  name?: string
  /** The worker's entry, from the app's root. Default `./src/worker.ts`. */
  entry?: string
  /**
   * What the plugin does with the warnings of its child compilation: hands
   * them to the compilation as they are, as new errors with a text of its
   * own, or not at all (default).
   */
  handOver?: 'as they are' | 'reworded' | false
  /**
   * When the child compiler runs: while the compilation makes its modules
   * (default), or once the compiler is done.
   */
  at?: 'make' | 'done'
}

/**
 * An app's own Rspack plugin of an environment: builds a worker in a child
 * compiler of the environment's compilation, emitted with its assets
 * (Rspack's public plugin API, as a worker or service-worker plugin uses
 * it).
 */
export function workerPluginOf(options: WorkerPluginOptions = {}) {
  const {
    name = 'worker',
    entry = './src/worker.ts',
    handOver = false,
    at = 'make',
  } = options
  const run = (compiler: Rspack.Compiler, compilation: Rspack.Compilation) => {
    const child = compilation.createChildCompiler(
      `app-${name}`,
      { filename: `${name}.js`, chunkFilename: `${name}-[name].js` },
      [
        new compiler.rspack.EntryPlugin(compiler.context, entry, { name }),
        new compiler.rspack.webworker.WebWorkerTemplatePlugin(),
      ],
    )
    return new Promise<void>((resolve, reject) => {
      child.runAsChild((error, _entries, built) => {
        if (error) {
          reject(error)
          return
        }
        const warnings = built?.warnings ?? []
        if (handOver === 'as they are') {
          compilation.warnings.push(...warnings)
        } else if (handOver === 'reworded') {
          for (const warning of warnings) {
            compilation.warnings.push(
              new compiler.rspack.WebpackError(`worker: ${warning.message}`),
            )
          }
        }
        resolve()
      })
    })
  }
  return {
    apply(compiler: Rspack.Compiler) {
      if (at === 'make') {
        compiler.hooks.make.tapPromise(`app:${name}`, (compilation) =>
          run(compiler, compilation),
        )
      } else {
        compiler.hooks.done.tapPromise(`app:${name}`, (stats) =>
          run(compiler, stats.compilation),
        )
      }
    },
  }
}

/** A worker plugin that builds `src/worker.ts` as `worker.js` and hands nothing over. */
export const workerPlugin = workerPluginOf()
