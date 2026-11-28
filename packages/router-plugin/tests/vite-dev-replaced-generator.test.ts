/**
 * Vite dev: `tsr.config.json` changes while a run of the generator it
 * configured is still in flight (a slow virtual route config). The plugin's
 * new generator writes the route tree of the new config on its next run; the
 * old run, once it ends, writes nothing: the tree on disk stays the new
 * generator's.
 * Source: review A of design-routeset-v4 (follow-up F6: a retired generator's
 * late write replaced its successor's tree).
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test, vi } from 'vitest'
import { createServer } from 'vite'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { tanstackRouterGenerator } from '../src/vite'
import { head, rootRoute } from './build-harness'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const route = (id: string) =>
  `${head}export const Route = createFileRoute('${id}')({})\n`

const config = (routesDirectory: string) =>
  JSON.stringify({
    target: 'react',
    routesDirectory,
    generatedRouteTree: './src/tree.gen.ts',
    disableLogging: true,
  })

test.each([{ oldRun: 'ends' as const }, { oldRun: 'fails' as const }])(
  'a run of the generator a config change replaced, which $oldRun after the new one ran, leaves the new route tree, publishes nothing and reports nothing',
  async ({ oldRun }) => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => reported.mockRestore())
    const { root } = await createApp({
      dir: harnessDir,
      registerCleanup: onTestFinished,
      files: {
        'tsr.config.json': config('./src/old'),
        'src/old/__root.tsx': rootRoute,
        'src/old/slow/old.tsx': route('/slow/old'),
        // (a virtual route config that waits for `release` once `armed` exists)
        'src/old/slow/__virtual.ts': `import { existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
export default async function () {
  if (existsSync(${JSON.stringify('ARMED')})) {
    writeFileSync(${JSON.stringify('ENTERED')}, '')
    while (!existsSync(${JSON.stringify('RELEASE')})) {
      await sleep(5)
    }
    if (existsSync(${JSON.stringify('FAIL')})) {
      throw new Error('the old virtual route config failed')
    }
  }
  return [{ type: 'route', path: '/old', file: 'old.tsx' }]
}
`,
        'src/new/__root.tsx': rootRoute,
        'src/new/fresh.tsx': route('/fresh'),
      },
    })
    const file = (relative: string) => path.join(root, relative)
    // (the virtual config's markers, absolute)
    const virtualConfig = file('src/old/slow/__virtual.ts')
    await writeFile(
      virtualConfig,
      (await readFile(virtualConfig, 'utf8'))
        .replace('"ARMED"', JSON.stringify(file('armed')))
        .replace('"ENTERED"', JSON.stringify(file('entered')))
        .replace('"RELEASE"', JSON.stringify(file('release')))
        .replace('"FAIL"', JSON.stringify(file('fail'))),
    )
    const published: Array<string> = []
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      // (the test reports each file event itself)
      server: {
        middlewareMode: true,
        ws: false,
        watch: { ignored: [path.join(root, '**')] },
      },
      optimizeDeps: { noDiscovery: true },
      plugins: [
        tanstackRouterGenerator({
          // (a generator plugin of the app: what each generation publishes)
          plugins: [
            {
              name: 'test:published-routes',
              onRouteTreeChanged({ model }) {
                published.push(model.routes.map((r) => r.id).join(','))
              },
            },
          ],
        }),
      ],
    })
    onTestFinished(async () => {
      await writeFile(file('release'), '')
      await server.close()
    })
    const tree = () => readFile(file('src/tree.gen.ts'), 'utf8')
    expect(await tree()).toContain('/slow/old')

    // a run of the old generator, held in the virtual config
    await writeFile(file('armed'), '')
    server.watcher.emit('change', virtualConfig)
    await waitForOutcome({
      timeout: 10_000,
      applied: () => existsSync(file('entered')),
      describe: () => 'the old generator did not run the virtual config',
    })
    // the config changes, and a file event runs the new generator
    await writeFile(file('tsr.config.json'), config('./src/new'))
    server.watcher.emit('change', file('tsr.config.json'))
    server.watcher.emit('change', file('src/new/fresh.tsx'))
    await waitForOutcome({
      timeout: 10_000,
      applied: async () => (await tree()).includes('/fresh'),
      describe: async () =>
        `the new route tree was not written:\n${await tree()}`,
    })
    // the old run ends (or fails): the tree stays the new one, and the old
    // generator publishes and reports nothing
    const publishedBefore = published.length
    const reportedBefore = reported.mock.calls.length
    if (oldRun === 'fails') {
      await writeFile(file('fail'), '')
    }
    await writeFile(file('release'), '')
    // (watched for 2 s: the old run's write, publication or report, when there
    // is one, comes within milliseconds)
    const oldRunShows = async () =>
      (await tree()).includes('/slow/old') ||
      published.length > publishedBefore ||
      reported.mock.calls.length > reportedBefore
    const watchedUntil = Date.now() + 2_000
    while (Date.now() < watchedUntil && !(await oldRunShows())) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(await tree()).toContain('/fresh')
    expect(await tree()).not.toContain('/slow/old')
    expect(published.slice(publishedBefore)).toEqual([])
    expect(reported.mock.calls.slice(reportedBefore)).toEqual([])
  },
)
