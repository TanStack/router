/**
 * What Start compiles in a build: the app's modules, and of its dependencies
 * (`node_modules`) only those that use Start; an asset imported by URL is
 * never read as code; a module the compiler leaves as it is reaches the
 * bundler as written. A real app has tens of thousands of dependency modules
 * and assets of megabytes (`esbuild.wasm?url`): compiling or reading them all
 * cost a large app a third of its build time. Measured through the
 * documented stats knob (TSR_COMPILER_STATS=1, read in the build's process
 * by a plugin of the app: the plans the client build made, and the files the
 * compiler read), and the code each module of the client build has after
 * every transform (`recordViteModules`, `recordParsedModules`). This file
 * runs in a process of its own (project `integration-alone`).
 */
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import {
  parsedModules,
  recordParsedModules,
  recordViteModules,
} from '@tanstack/compiler-test-utils/build-harness'
import { buildStart, startBundlers } from '../build-harness'
import type { ParsedModules } from '@tanstack/compiler-test-utils/build-harness'
import type { StartBundler } from '../build-harness'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'
import type { Plugin } from 'vite'

const timeout = 60_000

interface Counts {
  /** Plans of the client build. */
  plans: number
  /** Files the compiler read. */
  reads: number
}

/** The client build's counts: its plans when its bundle is generated, the files read since it started. */
interface Probe {
  start?: Counts
  end?: Counts
  modules: ParsedModules
}

function counts(bundler: StartBundler): Counts {
  const stats = compilerStats()[`start:${bundler}`]
  return { plans: stats?.plans ?? 0, reads: stats?.factsReads ?? 0 }
}

function viteProbe(probe: Probe): Array<Plugin> {
  return [
    {
      name: 'test-probe-compiler-state',
      apply: 'build',
      buildStart() {
        if (this.environment.name === 'client') {
          probe.start = counts('vite')
        }
      },
      generateBundle() {
        if (this.environment.name === 'client') {
          probe.end = counts('vite')
        }
      },
    },
    recordViteModules(probe.modules, { environment: 'client' }) as Plugin,
  ]
}

function rsbuildProbe(probe: Probe): RsbuildPlugin {
  return {
    name: 'test-probe-compiler-state',
    setup(api) {
      api.modifyRspackConfig((config, { environment }) => {
        if (environment.name !== 'client') {
          return
        }
        config.plugins.push(recordParsedModules(probe.modules) as never, {
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.make.tap(
              { name: 'test-probe-compiler-state', stage: -100 },
              () => {
                probe.start = counts('rsbuild')
              },
            )
            compiler.hooks.afterEmit.tap('test-probe-compiler-state', () => {
              probe.end = counts('rsbuild')
            })
          },
        })
      })
    },
  }
}

/** A dependency without anything of Start; its file has no final line feed. */
const plainLibrary = {
  'node_modules/plain-lib/package.json': JSON.stringify({
    name: 'plain-lib',
    type: 'module',
    main: './index.js',
  }),
  'node_modules/plain-lib/index.js': `export const plain = () => 'MARK_PLAIN'`,
}

/**
 * A dependency that uses Start (what it gives depends on the environment),
 * with a module that names a Start API without using it, and no final line
 * feed: compiled, and left as it is.
 */
const startLibrary = {
  'node_modules/start-lib/package.json': JSON.stringify({
    name: 'start-lib',
    type: 'module',
    main: './index.js',
  }),
  'node_modules/start-lib/index.js': `import { createIsomorphicFn } from '@tanstack/react-start'
export { note } from './note.js'
export const where = createIsomorphicFn()
  .client(() => 'MARK_LIB_CLIENT')
  .server(() => 'MARK_LIB_SERVER')
`,
  'node_modules/start-lib/note.js': `// works with createIsomorphicFn\nexport const note = () => 'MARK_NOTE'`,
}

/** Builds an app whose `src/dep.js` is `dep`, and reads what the client build compiled and read. */
async function build(bundler: StartBundler, dep: string) {
  vi.stubEnv('TSR_COMPILER_STATS', '1')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const probe: Probe = { modules: parsedModules() }
  const result = await buildStart({
    bundler,
    files: {
      ...plainLibrary,
      ...startLibrary,
      // an asset of a few megabytes, not text
      'src/big.png': '\u0089PNG'.padEnd(4 << 20, '\u00ff'),
      // no final line feed either
      'src/dep.js': dep,
      'entry.ts': `export { dep } from './src/dep.js'\n`,
    },
    ...(bundler === 'vite'
      ? { viteConfig: { plugins: viteProbe(probe) } }
      : { rsbuildConfig: { plugins: [rsbuildProbe(probe)] } }),
  })
  const { start, end } = probe as Required<Probe>
  return {
    ...result,
    counts: { plans: end.plans, reads: end.reads - start.reads },
    modules: probe.modules,
  }
}

const transformed = (modules: ParsedModules, file: string) =>
  [...modules.transformed.keys()].some((resource) =>
    resource.replaceAll('\\', '/').endsWith(file),
  )

describe.each(startBundlers)('a %s build', (bundler) => {
  test(
    'compiles a dependency only when it uses Start, and never reads an asset as code',
    async () => {
      const own = await build(bundler, `export const dep = () => 'MARK_OWN'`)
      const plain = await build(
        bundler,
        `import { plain } from 'plain-lib'\nexport const dep = plain`,
      )
      const start = await build(
        bundler,
        `import { note, where } from 'start-lib'\nexport const dep = [note, where]`,
      )
      expect(plain.client.where('MARK_PLAIN')).not.toBe('nowhere')
      // the dependency is no module of the compiler's
      expect(plain.counts.plans).toBe(own.counts.plans)
      if (bundler === 'vite') {
        // (Rsbuild: the runtime of an asset module fails the harness's
        // dangling-name check; the rule is the compiler core's, both hosts')
        const asset = await build(
          bundler,
          `import url from './big.png?url'\nexport const dep = () => url`,
        )
        // the asset is bundled, neither compiled nor read
        expect(asset.client.where(/\/assets\/big-[\w-]+\.png/)).not.toBe(
          'nowhere',
        )
        expect(asset.counts).toEqual(own.counts)
      }
      // the Start library's two modules are compiled: its server code is not in the client
      expect(start.counts.plans).toBe(own.counts.plans + 2)
      expect(start.client.where('MARK_LIB_CLIENT')).not.toBe('nowhere')
      expect(start.client.where('MARK_LIB_SERVER')).toBe('nowhere')
      // modules the compiler leaves as they are reach the bundler as written
      expect(
        transformed(plain.modules, 'node_modules/plain-lib/index.js'),
      ).toBe(false)
      expect(transformed(start.modules, 'node_modules/start-lib/note.js')).toBe(
        false,
      )
      expect(
        transformed(start.modules, 'node_modules/start-lib/index.js'),
      ).toBe(true)
    },
    timeout * 4,
  )
})
