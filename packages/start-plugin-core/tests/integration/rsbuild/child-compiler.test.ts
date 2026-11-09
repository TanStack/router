/**
 * Modules an Rspack child compiler of the client builds: what a service
 * worker or worker plugin does (workbox's `InjectManifest`,
 * `worker-rspack-loader`): `compilation.createChildCompiler` with its own
 * entry, run during the client compilation, its assets emitted with the
 * client's. The child compiler takes the client's module rules, so Start
 * compiles its modules as client modules: a server function becomes its
 * client call, which the server serves, and import protection judges their
 * imports (SPEC J4.1, J6).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
} from '../../build-harness'
import type { StartBuild } from '../../build-harness'
import type { Rspack } from '@rsbuild/core'

const timeout = 60_000

/**
 * The app's own Rspack plugin of the client environment: builds `src/worker.ts` in a child compiler
 * of the client compilation, emitted as `worker.js` with the client's
 * assets (Rspack's public plugin API, as a worker or service-worker plugin
 * uses it).
 */
const workerPlugin = {
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

const files = {
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { secret } from './db.server'
export const readSecret = createServerFn().handler(() => 'MARK_HANDLER:' + secret())
`,
  'src/db.server.ts': `export const secret = () => 'MARK_DB_SECRET'
`,
  'src/worker.ts': `import { readSecret } from './fns'
self.onmessage = () => {
  self.postMessage(readSecret.url)
}
`,
  'src/entry.ts': `export const ready = true
`,
  'src/ssr-entry.ts': callByIdExports,
}

describe('Rsbuild build: modules of a child compiler of the client', () => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler: 'rsbuild',
      files,
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      rsbuildConfig: {
        environments: {
          client: { tools: { rspack: { plugins: [workerPlugin] } } },
        },
      },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  const workerCode = () =>
    fs.readFileSync(path.join(build.client.outDir, 'worker.js'), 'utf8')

  test(
    'a server function in a worker is its client call: no handler, no server module',
    () => {
      const code = workerCode()
      expect(code).not.toContain('MARK_HANDLER')
      expect(code).not.toContain('MARK_DB_SECRET')
    },
    timeout,
  )

  test(
    'the worker calls the server function, which runs on the server',
    async () => {
      const url = (
        await build.client.run(`const worker = new Worker('/worker.js')
return await new Promise((resolve, reject) => {
  worker.onmessage = (event) => resolve(event.data)
  worker.onerror = (event) => reject(new Error(event.message))
  worker.postMessage(null)
})`)
      ).result
      const { result } = await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_HANDLER:MARK_DB_SECRET')
    },
    timeout,
  )
})

describe('Rsbuild build: import protection in a child compiler of the client', () => {
  const protectedFiles = {
    'src/db.server.ts': `export const secret = () => 'MARK_DB_SECRET'
`,
    'src/worker.ts': `import { secret } from './db.server'
self.onmessage = () => {
  self.postMessage(secret())
}
`,
    'src/entry.ts': `export const ready = true
`,
  }
  const config = {
    bundler: 'rsbuild' as const,
    files: protectedFiles,
    entry: 'src/entry.ts',
    rsbuildConfig: {
      environments: {
        client: { tools: { rspack: { plugins: [workerPlugin] } } },
      },
    },
  }

  // Known bug: a child compiler has no virtual files of its environment, so
  // the worker's import of the edge module does not resolve and the build
  // fails, whatever the behavior (safe: no server code ships).
  test.fails(
    'a worker importing a .server file gets its mock, and the build reports it',
    async () => {
      const built = await buildStart({
        ...config,
        start: { importProtection: { behavior: 'mock' } },
      }).catch((error: unknown) => error)
      expect(built, 'the build passes').not.toBeInstanceOf(Error)
      const build = built as StartBuild
      expect(
        fs.readFileSync(path.join(build.client.outDir, 'worker.js'), 'utf8'),
      ).not.toContain('MARK_DB_SECRET')
      expect(
        build.violations.map((v) => ({
          env: v.env,
          type: v.type,
          specifier: v.specifier,
          importer: path.relative(build.root, v.importer),
        })),
      ).toEqual([
        {
          env: 'client',
          type: 'file',
          specifier: './db.server',
          importer: path.join('src', 'worker.ts'),
        },
      ])
    },
    timeout,
  )
})
