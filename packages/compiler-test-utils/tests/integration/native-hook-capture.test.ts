/**
 * Controls of the console capture (`console-hook.ts`) for output printed
 * from native bundler callbacks: Rolldown calls a Vite build's plugin hooks,
 * and Rspack its compiler and compilation hooks, from native code, where
 * Node's async context is not propagated. What a compiler prints there is
 * a diagnostic like any other (SPEC §5.7: the channel is free), so the
 * hosts' and the build environment's merged channels must receive it, and
 * a "nothing reported" check must see it.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder } from 'vite'
import { expect, onTestFinished, test } from 'vitest'
import { createApp, withBuildEnvironment } from '../../src/build-harness'
import { createPluginHost } from '../../src/plugin-host'
import { createRsbuildPluginHost } from '../../src/rsbuild-plugin-host'
import type { RsbuildPlugin } from '@rsbuild/core'
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
    expect(marked(build.diagnostics.map(({ text }) => text))).toEqual(
      expect.arrayContaining([
        'MARK_NATIVE transform main.ts',
        'MARK_NATIVE generateBundle',
      ]),
    )
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
    const messages: Array<string> = []
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
    const reported = marked(messages)
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
          apply(compiler: {
            hooks: {
              thisCompilation: {
                tap: (
                  name: string,
                  callback: (compilation: {
                    hooks: {
                      processAssets: {
                        tap: (
                          options: { name: string; stage: number },
                          callback: () => void,
                        ) => void
                      }
                    }
                  }) => void,
                ) => void
              }
              done: { tap: (name: string, callback: () => void) => void }
            }
          }) {
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
        } as never)
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
    expect(marked(diagnostics.map(({ text }) => text))).toEqual(
      expect.arrayContaining(['MARK_NATIVE processAssets', 'MARK_NATIVE done']),
    )
  },
  timeout,
)
