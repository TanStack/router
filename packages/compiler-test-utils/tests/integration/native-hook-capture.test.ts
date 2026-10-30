/**
 * Controls of the console capture (`console-hook.ts`) for output printed
 * from native bundler callbacks: Rolldown calls a Vite build's plugin hooks,
 * and Rspack its compiler and compilation hooks, from native code, where
 * Node's async context is not propagated. What a compiler prints there is
 * a diagnostic like any other (SPEC §5.7: the channel is free), so:
 * - the hosts' and the build environment's merged channels receive it, and
 *   a "nothing reported" check sees it;
 * - with two apps at once, each channel receives what names its app, and
 *   output naming neither reaches both, marked `shared` (the owner is
 *   unknown), never silently.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder } from 'vite'
import { expect, onTestFinished, test } from 'vitest'
import { createApp, withBuildEnvironment } from '../../src/build-harness'
import { expectNoProblems } from '../../src/diagnostic-channel'
import { createPluginHost } from '../../src/plugin-host'
import { createRsbuildPluginHost } from '../../src/rsbuild-plugin-host'
import type { ChannelDiagnostic } from '../../src/diagnostic-channel'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'
import type { Plugin } from 'vite'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

const marked = (texts: Array<string>) =>
  texts.filter((text) => text.includes('MARK_NATIVE'))

/** Warns through the console from a module hook and a bundle hook. */
function consoleWarner(): Plugin {
  return {
    name: 'console-warner',
    transform(_code, id) {
      if (id.includes('/src/')) {
        console.warn(`MARK_NATIVE transform ${path.basename(id)}`)
      }
      return null
    },
    generateBundle() {
      console.warn('MARK_NATIVE generateBundle')
    },
  }
}

const viteFiles = {
  'index.html': `<div id="root"></div><script type="module" src="/src/main.ts"></script>`,
  'src/main.ts': `export const value = 1\n`,
}

test(
  'vite build: console output of Rolldown-called hooks is in the build diagnostics',
  async () => {
    const app = await createPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: viteFiles,
      plugins: [consoleWarner()],
      serve: false,
    })
    const build = await app.build()
    // "Nothing reported" sees build-time output
    expect(() => expectNoProblems(build.diagnostics)).toThrow(/MARK_NATIVE/)
    expect(marked(build.diagnostics.map(({ text }) => text))).toEqual(
      expect.arrayContaining([
        'MARK_NATIVE transform main.ts',
        'MARK_NATIVE generateBundle',
      ]),
    )
    // One build at a time: its owner is known
    expect(build.diagnostics.filter(({ shared }) => shared)).toEqual([])
  },
  timeout,
)

test(
  'withBuildEnvironment: a Vite build’s console output and default-logger warnings are in its messages',
  async () => {
    const app = await createApp({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: viteFiles,
    })
    const messages: Array<ChannelDiagnostic> = []
    await withBuildEnvironment('production', messages, async () => {
      const builder = await createBuilder({
        root: app.root,
        configFile: false,
        logLevel: 'warn',
        plugins: [
          consoleWarner(),
          {
            name: 'context-warner',
            transform(_code, id) {
              if (id.includes('/src/')) {
                this.warn(`MARK_NATIVE this.warn ${path.basename(id)}`)
              }
              return null
            },
          } satisfies Plugin,
        ],
      })
      await builder.buildApp()
    })
    const reported = marked(messages.map(({ text }) => text))
    expect(reported).toEqual(
      expect.arrayContaining([
        'MARK_NATIVE transform main.ts',
        'MARK_NATIVE generateBundle',
      ]),
    )
    expect(
      reported.some((text) => text.includes('MARK_NATIVE this.warn main.ts')),
    ).toBe(true)
  },
  timeout,
)

/** Warns through the console from Rspack compilation and compiler hooks. */
function rspackWarner(): RsbuildPlugin {
  return {
    name: 'rspack-warner',
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.thisCompilation.tap(
              'rspack-warner',
              (compilation) => {
                compilation.hooks.processAssets.tap(
                  { name: 'rspack-warner', stage: 0 },
                  () => {
                    console.warn('MARK_NATIVE processAssets')
                  },
                )
              },
            )
            compiler.hooks.done.tap('rspack-warner', () => {
              console.warn('MARK_NATIVE done')
            })
          },
        })
      })
    },
  }
}

test.each(['dev', 'build'] as const)(
  'rsbuild %s: console output of Rspack compiler and compilation hooks is in the diagnostics',
  async (mode) => {
    const host = await createRsbuildPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: { 'src/entry.ts': 'export const value = 1\n' },
      serve: mode === 'dev',
      plugins: [rspackWarner()],
    })
    const diagnostics =
      mode === 'dev' ? host.diagnostics : (await host.build()).diagnostics
    // "Nothing reported" sees build-time output
    expect(() => expectNoProblems(diagnostics)).toThrow(/MARK_NATIVE/)
    expect(marked(diagnostics.map(({ text }) => text))).toEqual(
      expect.arrayContaining(['MARK_NATIVE processAssets', 'MARK_NATIVE done']),
    )
    expect(diagnostics.filter(({ shared }) => shared)).toEqual([])
  },
  timeout,
)

/** Resolves once `count` callers wait on it: work that overlaps for sure. */
function barrier(count: number) {
  let arrived = 0
  let release!: () => void
  const all = new Promise<void>((resolve) => {
    release = resolve
  })
  return () => {
    arrived++
    if (arrived === count) {
      release()
    }
    return all
  }
}

/**
 * Two apps at once (`start` builds or serves one and returns its root and
 * diagnostics): each channel has the native-callback output naming its own
 * app and none naming the other's; output naming neither reaches both,
 * marked `shared`.
 */
async function expectSeparated(
  start: (
    meet: () => Promise<void>,
  ) => Promise<{ root: string; diagnostics: Array<ChannelDiagnostic> }>,
) {
  const meet = barrier(2)
  const apps = await Promise.all([start(meet), start(meet)])
  for (const [app, other] of [
    [apps[0], apps[1]],
    [apps[1], apps[0]],
  ] as const) {
    const texts = app.diagnostics.map(({ text }) => text)
    expect(texts.some((text) => text.includes(`MARK_OWNED ${app.root}`))).toBe(
      true,
    )
    expect(texts.some((text) => text.includes(other.root))).toBe(false)
    const unowned = app.diagnostics.filter(({ text }) =>
      text.includes('MARK_UNOWNED'),
    )
    expect(unowned.length).toBeGreaterThan(0)
    expect(unowned.every(({ shared }) => shared)).toBe(true)
    expect(
      app.diagnostics.filter(
        ({ text, shared }) => shared && !text.includes('MARK_UNOWNED'),
      ),
    ).toEqual([])
  }
}

test(
  'vite build: concurrent builds keep native-hook output naming their app, and share output naming neither',
  async () => {
    await expectSeparated(async (meet) => {
      let root = ''
      const app = await createPluginHost({
        dir: testsDir,
        registerCleanup: onTestFinished,
        files: viteFiles,
        serve: false,
        plugins: [
          {
            name: 'owned-warner',
            configResolved(config) {
              root = config.root
            },
            async generateBundle() {
              await meet()
              console.warn(`MARK_OWNED ${root}/src/main.ts`)
              console.warn('MARK_UNOWNED generateBundle')
            },
          } satisfies Plugin,
        ],
      })
      return { root: app.root, diagnostics: (await app.build()).diagnostics }
    })
  },
  timeout,
)

test.each(['dev', 'build'] as const)(
  'rsbuild %s: concurrent apps keep native-hook output naming their app, and share output naming neither',
  async (mode) => {
    await expectSeparated(async (meet) => {
      const host = await createRsbuildPluginHost({
        dir: testsDir,
        registerCleanup: onTestFinished,
        files: { 'src/entry.ts': 'export const value = 1\n' },
        serve: mode === 'dev',
        plugins: [
          {
            name: 'owned-warner',
            setup(api) {
              api.modifyRspackConfig((config) => {
                config.plugins.push({
                  apply(compiler: Rspack.Compiler) {
                    compiler.hooks.thisCompilation.tap(
                      'owned-warner',
                      (compilation) => {
                        compilation.hooks.processAssets.tapPromise(
                          { name: 'owned-warner', stage: 0 },
                          async () => {
                            await meet()
                            console.warn(
                              `MARK_OWNED ${compiler.context}/src/entry.ts`,
                            )
                            console.warn('MARK_UNOWNED processAssets')
                          },
                        )
                      },
                    )
                  },
                })
              })
            },
          },
        ],
      })
      return {
        root: host.root,
        diagnostics:
          mode === 'dev' ? host.diagnostics : (await host.build()).diagnostics,
      }
    })
  },
  timeout,
)
