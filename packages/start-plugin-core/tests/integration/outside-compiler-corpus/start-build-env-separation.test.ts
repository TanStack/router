/**
 * Not part of the compiler test corpus (SYNTHESIS S7-123, the lifecycle
 * half): the Start compiler's internal Vite plugin (`startCompilerPlugin`)
 * on its own, in an SSR environment a builder builds twice with a hand-set
 * input each time. It checks a lifecycle of today's implementation (the
 * compiler plugin keeps compiling across builds of one builder); the corpus
 * test "the second build compiles the server fns of its modules" in
 * `integration/start-build-env-separation.test.ts` decides the outcome
 * through Start's whole public plugin. The built server fn runs inside a
 * real request of a Start app (`inDevRequest`).
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { describe, expect, onTestFinished, test } from 'vitest'
import { startCompilerPlugin } from '../../../src/vite/start-compiler-plugin/plugin'
import { startRuntimeLinks } from '../../build-harness'
import {
  inDevRequest,
  startDevServer,
  startRequestFiles,
} from '../../dev-server'

const timeout = 60_000

describe('Vite: an environment built twice by one builder', () => {
  // `@vitejs/plugin-rsc` runs a scan build of an environment before its real
  // build, with the same plugins: the second build compiles server fns
  // again, including ones whose builder the compiler loads from another
  // module.
  // Source: mutation round 3 sc-hosts 4.
  test(
    'the second build compiles the server fns of its modules',
    async () => {
      const app = await createApp({
        dir: path.dirname(path.dirname(fileURLToPath(import.meta.url))),
        prefix: '.start-build-twice-',
        registerCleanup: onTestFinished,
        symlinks: startRuntimeLinks(),
        files: {
          'src/direct.ts': `import { createServerFn } from '@tanstack/react-start'
export const direct = createServerFn().handler(async () => 'MARK_DIRECT')
`,
          'src/base.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
          'src/fns.ts': `import { base } from './base'
export const greet = base.handler(async () => 'MARK_HANDLER')
`,
        },
      })
      const { createBuilder } = await import('vite')
      /** Entry module of each build of the SSR environment. */
      const inputs = ['src/direct.ts', 'src/fns.ts']
      let builds = 0
      let lastEntry: string | undefined
      const builder = await createBuilder({
        root: app.root,
        configFile: false,
        logLevel: 'silent',
        environments: {
          client: { build: { outDir: 'dist/client' } },
          // `ssr` names an entry; `build-twice-input` sets each build's
          ssr: { build: { outDir: 'dist/ssr', ssr: inputs[0] } },
        },
        ssr: { noExternal: true },
        builder: {
          async buildApp(appBuilder) {
            for (const _input of inputs) {
              await appBuilder.build(appBuilder.environments.ssr!)
              builds++
            }
          },
        },
        plugins: [
          {
            name: 'build-twice-input',
            applyToEnvironment: (environment) => environment.name === 'ssr',
            options: (options) => ({
              ...options,
              input: path.join(app.root, inputs[builds]!),
            }),
          },
          {
            name: 'last-entry',
            applyToEnvironment: (environment) => environment.name === 'ssr',
            writeBundle(options, bundle) {
              const entry = Object.values(bundle).find(
                (chunk) => chunk.type === 'chunk' && chunk.isEntry,
              )
              lastEntry = path.join(options.dir!, entry!.fileName)
            },
          },
          startCompilerPlugin({
            framework: 'react',
            environments: [
              { name: 'client', type: 'client' },
              { name: 'ssr', type: 'server' },
            ],
            providerEnvName: 'ssr',
          }),
        ],
      })
      await builder.buildApp()
      expect(builds).toBe(2)
      // The chunk of the last build's entry, as the bundle names it.
      const { greet } = await import(pathToFileURL(lastEntry!).href)
      expect(typeof greet.serverFnMeta.id).toBe('string')
      // The build has no server entry of its own (the compiler plugin only):
      // the server fn runs inside a real request of a Start app, which a dev
      // server of the harness serves (Start's request context is shared by
      // every copy of Start's runtime in a process).
      const requests = await startDevServer({ files: startRequestFiles })
      expect(await inDevRequest(requests, () => greet())).toBe('MARK_HANDLER')
    },
    timeout,
  )
})
