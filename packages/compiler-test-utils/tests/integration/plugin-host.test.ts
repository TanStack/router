/**
 * Controls of the public in-process plugin host (plugin-host.ts), slow
 * tier: client code runs in the shared Chromium page with the real Vite
 * client (a real hot context, real ES module linking), and `vite build`
 * runs the same public plugins, with each environment's chunks and the
 * build's merged diagnostics.
 */
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { expectDiagnostic } from '../../src/diagnostics'
import { HostBuildError, createPluginHost } from '../../src/plugin-host'
import type { Plugin } from 'vite'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/** Rewrites `__MARK__` in the app's modules; warns through `this.warn`. */
const userPlugin: Plugin = {
  name: 'user-plugin',
  transform(code, id) {
    if (!id.includes('/src/') || !code.includes('__MARK__')) {
      return null
    }
    this.warn(`rewrote a marker in ${id}`)
    return code.replaceAll('__MARK__', 'MARKED')
  },
}

const files = {
  'index.html': `<div id="root"></div><script type="module" src="/src/main.ts"></script>`,
  'src/main.ts': `import { label } from './label'
export const render = () => {
  document.getElementById('root')!.textContent = label
  return document.body.innerHTML
}
render()
export const hot = () => ({
  hot: typeof import.meta.hot,
  data: typeof import.meta.hot?.data,
})
`,
  'src/label.ts': `export const label = '__MARK__ label'\n`,
  'src/missing.ts': `import { absent } from './label'
export const read = () => absent
`,
}

test(
  'client code runs in the shared page: rendered by the module, with the real hot context, and a missing import throws',
  async () => {
    const app = await createPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files,
      plugins: [userPlugin],
      client: true,
    })
    const started = performance.now()
    const rendered = await app.runClient<string>(
      '/src/main.ts',
      'return module.render().trim()',
    )
    const first = performance.now() - started
    expect(rendered.result).toBe('<div id="root">MARKED label</div>')
    expect(rendered.errors).toEqual([])

    // The real Vite client: `import.meta.hot` with its `data`
    const again = performance.now()
    expect(
      (await app.runClient('/src/main.ts', 'return module.hot()')).result,
    ).toEqual({ hot: 'object', data: 'object' })
    const second = performance.now() - again

    await expect(app.runClient('/src/missing.ts')).rejects.toThrow(
      /does not provide an export named 'absent'/,
    )
    // The page is reused: a later run costs a page load, not a browser
    // (the dev server's channel records the test's console too)
    if (process.env.PLUGIN_HOST_TIMINGS) {
      await appendFile(
        process.env.PLUGIN_HOST_TIMINGS,
        `page runs: first ${first.toFixed(0)} ms, next ${second.toFixed(0)} ms\n`,
      )
    }
  },
  timeout,
)

test(
  'vite build runs the same public plugins; chunks, describe() and diagnostics',
  async () => {
    const app = await createPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files,
      plugins: [userPlugin],
      serve: false,
    })
    const build = await app.build()
    const client = build.environments.client!
    expect(client.chunks.some((chunk) => chunk.code.includes('MARKED'))).toBe(
      true,
    )
    // The plugin's warning, through Vite's logger, in the merged channel
    expectDiagnostic(build.diagnostics, {
      severity: 'warning',
      file: 'src/label.ts',
      root: app.root,
    })
    const described = await build.describe('client')
    expect(described.where('MARKED')).toBe('eager')
  },
  timeout,
)

test(
  'a failed build rejects with its error and what it reported',
  async () => {
    const app = await createPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: { ...files, 'src/label.ts': `export const label = (` },
      plugins: [userPlugin],
      serve: false,
    })
    const error = await app.build().catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(HostBuildError)
    expectDiagnostic(error, {
      severity: 'error',
      file: 'src/label.ts',
      root: app.root,
      position: { line: 1 },
    })
  },
  timeout,
)
