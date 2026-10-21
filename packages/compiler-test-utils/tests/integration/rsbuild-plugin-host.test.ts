/**
 * Controls of the Rsbuild plugin host (rsbuild-plugin-host.ts): the public
 * Rsbuild plugins run through Rsbuild's JavaScript API in process. Server
 * code loads through Rsbuild's own `loadBundle`, client code runs in the
 * shared Chromium page, edits settle on their outcome, the production build
 * returns each environment's output with its dangling-name evidence, and a
 * plugin's console warning lands in the same channel as the compilation's.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { describeBuild } from '../../src/build-harness'
import { expectDiagnostic } from '../../src/diagnostics'
import { createRsbuildPluginHost } from '../../src/rsbuild-plugin-host'
import type { RsbuildPlugin } from '@rsbuild/core'

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
