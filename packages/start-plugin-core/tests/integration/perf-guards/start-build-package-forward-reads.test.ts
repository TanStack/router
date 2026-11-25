/**
 * Which modules of a package that does not declare Start the compiler reads
 * (parses for its summaries) because they forward an import: an export list
 * naming a value import is read; a type-only import, export or re-export,
 * a JSDoc example and a string that look like one are not (reviews of 3c79e6cb74,
 * D-21 B). A read is otherwise invisible in the output, so it is counted
 * through the documented stats knob (TSR_COMPILER_STATS=1, read in the
 * build's process by a plugin of the app: the dependency modules left
 * unread during the client build). This file runs in a process of its own
 * (project `perf-guards`).
 */
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { buildStart, startBundlers } from '../../build-harness'
import { appManifest, installPackage } from '../../package-layouts'
import type { StartBundler } from '../../build-harness'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'
import type { Plugin } from 'vite'

const timeout = 60_000

/** Dependency modules left unread so far, in every live session of the bundler's. */
const unread = (bundler: StartBundler) =>
  compilerStats()[`start:${bundler}`]?.rawFactsOpaque ?? 0

interface Probe {
  start?: number
  end?: number
}

function viteProbe(probe: Probe): Plugin {
  return {
    name: 'test-probe-unread',
    apply: 'build',
    buildStart() {
      if (this.environment.name === 'client') {
        probe.start = unread('vite')
      }
    },
    generateBundle() {
      if (this.environment.name === 'client') {
        probe.end = unread('vite')
      }
    },
  }
}

function rsbuildProbe(probe: Probe): RsbuildPlugin {
  return {
    name: 'test-probe-unread',
    setup(api) {
      api.modifyRspackConfig((config, { environment }) => {
        if (environment.name !== 'client') {
          return
        }
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.make.tap(
              { name: 'test-probe-unread', stage: -100 },
              () => {
                probe.start = unread('rsbuild')
              },
            )
            compiler.hooks.afterEmit.tap('test-probe-unread', () => {
              probe.end = unread('rsbuild')
            })
          },
        })
      })
    },
  }
}

/** `auth-lib` declares Start and makes the builder; `ui-kit` does not declare Start. */
const auth = installPackage('npm', {
  name: 'auth-lib',
  declaration: 'peer',
  files: {
    'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport const base = createServerFn({ method: 'POST' })\n`,
  },
})

/** The client build's count of unread dependency modules, with `ui-kit`'s entry `index.ts` as given. */
async function unreadWith(bundler: StartBundler, entry: string) {
  vi.stubEnv('TSR_COMPILER_STATS', '1')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const kit = installPackage('npm', {
    name: 'ui-kit',
    declaration: 'none',
    files: { 'index.ts': entry },
    manifest: { exports: { '.': './index.ts' } },
  })
  const probe: Probe = {}
  await buildStart({
    bundler,
    files: {
      ...auth.files,
      ...kit.files,
      'src/app.ts': `import { kit } from 'ui-kit'\nexport const app = () => kit\n`,
      'entry.ts': `export { app } from './src/app'\n`,
    },
    packageJson: appManifest([auth, kit]),
    ...(bundler === 'vite'
      ? { viteConfig: { plugins: [viteProbe(probe)] } }
      : { rsbuildConfig: { plugins: [rsbuildProbe(probe)] } }),
  })
  return probe.end! - probe.start!
}

/** `ui-kit`'s entry without a forward: unread. */
const plain = `import { base } from 'auth-lib'\nexport const kit = typeof base\n`

describe.each(startBundlers)('a %s build', (bundler) => {
  test(
    "an export list naming a value import makes a package's module read; type-only forms, a JSDoc example and a string do not",
    async () => {
      const control = await unreadWith(bundler, plain)
      // the value import forwarded: read
      expect(await unreadWith(bundler, `${plain}export { base }\n`)).toBe(
        control - 1,
      )
      // every shape that only looks like a forward, in one module: still unread
      expect(
        await unreadWith(
          bundler,
          `/**
 * @example
 * import { kit } from 'ui-kit'
 * export { kit }
 */
import type { Cfg } from 'auth-lib'
import { type Opts, base } from 'auth-lib'
export type { Opts }
export type { Cfg as Settings } from 'auth-lib'
export { type Cfg as Config }
const type = 1
export { type }
export const note = 'import { a } from "b"; export { a }'
export const kit = typeof base
`,
        ),
      ).toBe(control)
    },
    timeout * 3,
  )
})
