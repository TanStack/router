import type { Rspack } from '@rsbuild/core'

/**
 * The app's own Rspack plugin of the client environment: builds `src/worker.ts` in a child compiler
 * of the client compilation, emitted as `worker.js` with the client's
 * assets (Rspack's public plugin API, as a worker or service-worker plugin
 * uses it).
 */
export const workerPlugin = {
  apply(compiler: Rspack.Compiler) {
    compiler.hooks.make.tapPromise('app:worker', (compilation) => {
      const child = compilation.createChildCompiler(
        'app-worker',
        { filename: 'worker.js', chunkFilename: 'worker-[name].js' },
        [
          new compiler.rspack.EntryPlugin(compiler.context, './src/worker.ts', {
            name: 'worker',
          }),
          new compiler.rspack.webworker.WebWorkerTemplatePlugin(),
        ],
      )
      return new Promise<void>((resolve, reject) => {
        child.runAsChild((error) => (error ? reject(error) : resolve()))
      })
    })
  },
}
