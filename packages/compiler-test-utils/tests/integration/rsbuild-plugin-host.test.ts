/**
 * Controls of the Rsbuild plugin host (rsbuild-plugin-host.ts): the public
 * Rsbuild plugins run through Rsbuild's JavaScript API in process. Server
 * code loads through Rsbuild's own `loadBundle`, client code runs in the
 * shared Chromium page, edits settle on their outcome, the production build
 * returns each environment's output with its dangling-name evidence, and a
 * plugin's console warning lands in the same channel as the compilation's
 * and Rsbuild's logger's, each compilation report once.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { describeBuild } from '../../src/build-harness'
import { problems } from '../../src/diagnostic-channel'
import { expectDiagnostic } from '../../src/diagnostics'
import {
  RsbuildHostBuildError,
  createRsbuildPluginHost,
} from '../../src/rsbuild-plugin-host'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/** Rewrites `__MARK__` (a loader of its own) and warns through the console. */
function userPlugin(): RsbuildPlugin {
  return {
    name: 'user-plugin',
    setup(api) {
      api.transform({ test: /\.ts$/ }, ({ code, resourcePath }) => {
        if (!code.includes('__MARK__')) {
          return code
        }
        console.warn(`[user-plugin] rewrote a marker in ${resourcePath}`)
        return code.replaceAll('__MARK__', 'MARKED')
      })
    },
  }
}

const files = {
  'src/entry.ts': `import { label } from './label'
const shown = document.createElement('div')
shown.id = 'shown'
shown.textContent = label
document.body.append(shown)
`,
  'src/server.ts': `import { label } from './label'
export const read = () => label
`,
  'src/label.ts': `export const label = '__MARK__ v1'\n`,
}

const environments = {
  web: { source: { entry: { index: './src/entry.ts' } } },
  node: {
    source: { entry: { index: './src/server.ts' } },
    // CommonJS: Rsbuild's `loadBundle` runs an ES module bundle only with
    // Node's `--experimental-vm-modules`
    output: { target: 'node' as const, module: false },
  },
}

test(
  'dev: server code through loadBundle, client code in the page, an edit, merged diagnostics',
  async () => {
    const host = await createRsbuildPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files,
      plugins: [userPlugin()],
      config: { environments },
      client: true,
    })
    const server = await host.loadServer<{ read: () => string }>('node')
    expect(server.read()).toBe('MARKED v1')
    expect(
      (
        await host.runClient(
          `return document.getElementById('shown').textContent`,
        )
      ).result,
    ).toBe('MARKED v1')
    // The plugin warned through the console: the server's channel has it
    expectDiagnostic(host.diagnostics, {
      severity: 'warning',
      file: 'src/label.ts',
      root: host.root,
    })

    await host.edit({ 'src/label.ts': `export const label = '__MARK__ v2'\n` })
    expect((await host.loadServer<{ read: () => string }>('node')).read()).toBe(
      'MARKED v2',
    )
  },
  timeout,
)

test(
  'build: each environment output, and the production client evidence for the dangling-name check',
  async () => {
    const host = await createRsbuildPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files,
      plugins: [userPlugin()],
      config: { environments },
      serve: false,
    })
    const build = await host.build()
    expect(Object.keys(build.environments).sort()).toEqual(['node', 'web'])
    expect(Object.values(build.environments.web!.files).join('\n')).toContain(
      'MARKED v1',
    )
    expect(build.parsedModules.web!.modules.size).toBeGreaterThan(0)
    expectDiagnostic(build.diagnostics, {
      severity: 'warning',
      file: 'src/label.ts',
      root: host.root,
    })
    // The output passes the dangling-name check with that evidence
    const web = build.environments.web!
    const entry = Object.keys(web.files).find((file) => file.includes('index'))!
    await describeBuild({
      bundler: 'rspack',
      env: 'client',
      mode: 'production',
      esModules: false,
      root: host.root,
      outDir: web.distPath,
      chunks: [
        { fileName: entry, isEntry: true, imports: [], dynamicImports: [] },
      ],
      parsedModules: build.parsedModules.web,
      warnings: [],
      consoleMessages: [],
      duration: 0,
      dispose: async () => {},
    })
  },
  timeout,
)

test.each(['dev', 'build'] as const)(
  'the %s host records warnings through Rsbuild’s logger',
  async (mode) => {
    const host = await createRsbuildPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: { 'src/entry.ts': 'export const value = 1' },
      serve: mode === 'dev',
      plugins: [
        {
          name: 'logger-control',
          setup(api) {
            api.onBeforeEnvironmentCompile(() => {
              api.logger.warn('src/entry.ts: logger control warning')
            })
          },
        },
      ],
    })
    const diagnostics =
      mode === 'dev' ? host.diagnostics : (await host.build()).diagnostics
    expectDiagnostic(diagnostics, {
      severity: 'warning',
      file: 'src/entry.ts',
    })
  },
  timeout,
)

test(
  'concurrent Rsbuild apps retain their own native-loader diagnostics',
  async () => {
    const start = () =>
      createRsbuildPluginHost({
        dir: testsDir,
        registerCleanup: onTestFinished,
        files: { 'src/entry.ts': "export const value = '__MARK__'" },
        plugins: [userPlugin()],
      })
    const [first, second] = await Promise.all([start(), start()])
    await Promise.all([
      first.edit({ 'src/entry.ts': "export const value = '__MARK__ edited'" }),
      second.edit({ 'src/entry.ts': "export const value = '__MARK__ edited'" }),
    ])
    for (const [app, other] of [
      [first, second],
      [second, first],
    ] as const) {
      expectDiagnostic(app.diagnostics, {
        severity: 'warning',
        file: 'src/entry.ts',
        root: app.root,
      })
      expect(
        app.diagnostics.some(({ text }) => text.includes(other.root)),
      ).toBe(false)
    }
  },
  timeout,
)

/**
 * Adds a compilation warning or error naming the entry (`processAssets`),
 * as a compiler reporting through the compilation does.
 */
function compilationReporter(severity: 'warning' | 'error'): RsbuildPlugin {
  return {
    name: 'compilation-reporter',
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.thisCompilation.tap(
              'compilation-reporter',
              (compilation) => {
                compilation.hooks.processAssets.tap(
                  { name: 'compilation-reporter', stage: 0 },
                  () => {
                    const report = new compiler.webpack.WebpackError(
                      `MARK_COMPILATION ${severity}: ${path.join(compiler.context, 'src/entry.ts')} is reported`,
                    )
                    if (severity === 'error') {
                      compilation.errors.push(report)
                    } else {
                      compilation.warnings.push(report)
                    }
                  },
                )
              },
            )
          },
        })
      })
    },
  }
}

// Rsbuild's logger prints each compile's report again (and a status line
// for a compile that failed); the channel records the report once, from
// the compilation.
test.each([
  ['dev', 'warning'],
  ['dev', 'error'],
  ['build', 'warning'],
  ['build', 'error'],
] as const)(
  'the %s host records a compilation %s once',
  async (mode, severity) => {
    const host = await createRsbuildPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: { 'src/entry.ts': 'export const value = 1' },
      serve: mode === 'dev',
      plugins: [compilationReporter(severity)],
    })
    const diagnostics =
      mode === 'dev'
        ? host.diagnostics
        : await host.build().then(
            (build) => build.diagnostics,
            (error: unknown) => {
              expect(error).toBeInstanceOf(RsbuildHostBuildError)
              return (error as RsbuildHostBuildError).diagnostics
            },
          )
    expectDiagnostic(diagnostics, {
      severity,
      file: 'src/entry.ts',
      root: host.root,
      times: 1,
    })
    expect(problems(diagnostics)).toHaveLength(1)
  },
  timeout,
)
