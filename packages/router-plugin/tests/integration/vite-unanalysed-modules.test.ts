/**
 * Tripwire of what the Vite hosts' hot update relies on of Vite's module
 * graph (router-utils `hosts/vite.ts`, `liveModules`), which Vite does not
 * document: a module its importer's import analysis created and nothing
 * requested has `isSelfAccepting` unset (it is set by the module's own
 * analysis), and an edit of such a module sends the page nothing (Vite
 * stops an update's propagation at a module it never analysed). The hosts
 * therefore do not transform a route for derived modules that were never
 * loaded: keeping or dropping them changes nothing. Goes red when Vite
 * changes either.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, expect, onTestFinished, test } from 'vitest'
import { createServer } from 'vite'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import type { HotPayload, Plugin } from 'vite'

const roots: Array<string> = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a module only imported, never requested, is not analysed and its edit sends nothing', async () => {
  const root = fs.mkdtempSync(path.join(runDirectory(), 'tsr-unanalysed-'))
  roots.push(root)
  const write = (name: string, text: string) =>
    fs.writeFileSync(path.join(root, name), text)
  write('a.ts', `export const load = () => import('./lazy')\n`)
  write('lazy.ts', `export const lazy = 1\n`)
  write('control.ts', `export const control = 1\n`)
  /** The payloads sent to the page, and the files whose hot update ran. */
  const sent: Array<HotPayload> = []
  const handled: Array<string> = []
  let notify = () => {}
  const record: Plugin = {
    name: 'test:record-updates',
    configureServer(server) {
      const hot = server.environments.client.hot
      const send = hot.send.bind(hot)
      hot.send = ((payload: HotPayload) => {
        sent.push(payload)
        notify()
        return send(payload)
      }) as typeof hot.send
    },
    hotUpdate({ file }) {
      if (this.environment.name === 'client') {
        handled.push(path.basename(file))
      }
    },
  }
  const server = await createServer({
    root,
    configFile: false,
    envFile: false,
    appType: 'custom',
    clearScreen: false,
    logLevel: 'silent',
    cacheDir: path.join(root, 'node_modules/.vite'),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1' },
    plugins: [record],
  })
  onTestFinished(() => server.close())
  await server.listen()
  const client = server.environments.client
  await client.transformRequest('/a.ts')
  await client.transformRequest('/control.ts')
  const lazy = await client.moduleGraph.getModuleByUrl('/lazy.ts')
  expect(lazy).toBeDefined()
  expect(lazy!.isSelfAccepting).toBeUndefined()
  // an edit of the unanalysed module, then of an analysed one: the
  // watcher reports them in order, so the second's payload comes after
  // whatever the first sent
  const controlSent = new Promise<void>((resolve) => {
    notify = () => {
      if (handled.includes('control.ts')) {
        resolve()
      }
    }
  })
  write('lazy.ts', `export const lazy = 2\n`)
  await expect.poll(() => handled.includes('lazy.ts')).toBe(true)
  write('control.ts', `export const control = 2\n`)
  await controlSent
  expect(handled.slice(0, 2)).toEqual(['lazy.ts', 'control.ts'])
  expect(
    sent.filter((p) => p.type === 'update' || p.type === 'full-reload'),
  ).toHaveLength(1)
  // once requested, the module is analysed
  await client.transformRequest('/lazy.ts')
  expect(typeof lazy!.isSelfAccepting).toBe('boolean')
}, 30_000)
