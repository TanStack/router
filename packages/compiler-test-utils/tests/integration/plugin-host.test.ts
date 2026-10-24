/**
 * Controls of the public in-process plugin host (plugin-host.ts), slow
 * tier: client code runs in the shared Chromium page with the real Vite
 * client (a real hot context, real ES module linking), and `vite build`
 * runs the same public plugins, with each environment's chunks and the
 * build's merged diagnostics.
 */
import diagnosticsChannel from 'node:diagnostics_channel'
import { appendFile } from 'node:fs/promises'
import net from 'node:net'
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

// Vite keeps a full reload sent while no client is
// connected and hands it to the next client that connects. Between two
// `runClient` runs no page is connected, so the next run's page would
// reload under its run; a client host keeps an idle HMR client connected
// instead. The probe connects as the next page's Vite client would, and
// reads everything the server sends it up to a marker sent after it
// connected (a held message is sent right after `connected`, before it).
test(
  'a full reload sent while no page runs is not handed to the next page that connects',
  async () => {
    const app = await createPluginHost({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files,
      plugins: [],
      client: true,
    })
    // No page of this host is open (as between two runs once the shared page
    // moved on to another host or app): an edit's full reload now
    app.dev.vite.ws.send({ type: 'full-reload', path: '*' })

    const url = new URL(app.dev.url!)
    url.protocol = 'ws:'
    url.searchParams.set('token', app.dev.vite.config.webSocketToken)
    const probe = new WebSocket(url, 'vite-hmr')
    onTestFinished(() => probe.close())
    const received: Array<{ type: string; event?: string }> = []
    await new Promise<void>((resolve, reject) => {
      probe.addEventListener('error', () => reject(new Error('no connection')))
      probe.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data))
        received.push(message)
        if (message.type === 'connected') {
          app.dev.vite.ws.send({ type: 'custom', event: 'probe:end' })
        }
        if (message.event === 'probe:end') {
          resolve()
        }
      })
    })
    expect(received.map(({ type }) => type)).toEqual(['connected', 'custom'])
  },
  timeout,
)

// Under heavy load, a test worker's event loop can stay
// blocked (other tests' synchronous work) right when the idle HMR client
// connects at host start. A client of this process must still reach the
// server: Node's address-family selection gives a connection attempt
// `getDefaultAutoSelectFamilyAttemptTimeout()` on the event loop's clock,
// so a client of a name with two addresses, of which the server listens on
// one, abandoned the connection the kernel had made and was refused at the
// other ("no HMR connection"). The block runs once each attempt's timer is
// set, as a busy worker's would.
test(
  'a client host starts while the event loop is blocked past the attempt timeout of address-family selection',
  async () => {
    const blockFor = net.getDefaultAutoSelectFamilyAttemptTimeout() + 300
    const attempts: Array<string> = []
    const onSocket = (message: unknown) => {
      const { socket } = message as { socket: net.Socket }
      socket.once('connectionAttempt', (address: string, port: number) => {
        attempts.push(`${address}:${port}`)
        queueMicrotask(() => {
          const end = performance.now() + blockFor
          while (performance.now() < end) {
            // a worker busy with synchronous work
          }
        })
      })
    }
    diagnosticsChannel.subscribe('net.client.socket', onSocket)
    let app
    try {
      app = await createPluginHost({
        dir: testsDir,
        registerCleanup: onTestFinished,
        files,
        plugins: [],
        client: true,
      })
    } finally {
      diagnosticsChannel.unsubscribe('net.client.socket', onSocket)
    }
    // The idle client went through the blocked attempt, to the server
    const port = new URL(app.dev.url!).port
    expect(attempts.some((attempt) => attempt.endsWith(`:${port}`))).toBe(true)
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
