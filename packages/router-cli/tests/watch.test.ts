/**
 * `tsr watch` (`watch()`) on an app in a temporary directory: its config
 * file's changes start the generator session again. The outcome is the
 * route tree on disk.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, onTestFinished, test, vi } from 'vitest'
import { watch } from '../src/watch'

const rootRoute = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`
const fileRoute = (id: string) =>
  `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('${id}')({})
`

/** An app with two routes directories, `src/a` (`/one`) and `src/b` (`/two`). */
async function createApp() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsr-watch-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const files = {
    'src/a/__root.tsx': rootRoute,
    'src/a/one.tsx': fileRoute('/one'),
    'src/b/__root.tsx': rootRoute,
    'src/b/two.tsx': fileRoute('/two'),
  }
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  return root
}

/** The `tsr.config.json` of the app at `root` for a routes directory. */
const configFor = (root: string, routesDirectory: string) =>
  JSON.stringify({
    routesDirectory,
    generatedRouteTree: './src/routeTree.gen.ts',
    tmpDir: path.join(root, '.tanstack/tmp'),
    disableLogging: true,
  })

/** Resolves once the app's route tree imports the routes directory's route. */
async function treeImports(root: string, route: string) {
  const tree = path.join(root, 'src/routeTree.gen.ts')
  const deadline = Date.now() + 10_000
  for (;;) {
    const content = await readFile(tree, 'utf8').catch(() => '')
    if (content.includes(`'${route}'`)) {
      return content
    }
    if (Date.now() > deadline) {
      throw new Error(`the route tree does not import ${route}:\n${content}`)
    }
    await sleep(25)
  }
}

// Bug: a `tsr.config.json` replaced by a save (removed, then written again:
// a branch switch, a tool that deletes the file first) left `tsr watch` on
// the previous config until it restarted.
// Source: src/watch.ts started again on the config file's `change` only;
// the watcher reports such a save as the file's removal, then its creation
// (`add`): when it is written again more than 100 ms later, and under
// polling (`CHOKIDAR_USEPOLLING`) with chokidar 6 even sooner.
// Impact: the routes directory and every other option of the new config
// are ignored, and the route tree stays the previous config's.
test.each([
  { watcher: 'native', env: {}, rewriteAfter: 200 },
  {
    watcher: 'polling',
    env: { CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '20' },
    rewriteAfter: 50,
  },
])(
  'a config file replaced by a save starts the generator with the new config ($watcher watcher)',
  async ({ env, rewriteAfter }) => {
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value)
    }
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const reported: Array<unknown> = []
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation((error) => {
      reported.push(error)
    })
    onTestFinished(() => {
      vi.restoreAllMocks()
    })
    const root = await createApp()
    const configFile = path.join(root, 'tsr.config.json')
    await writeFile(configFile, configFor(root, './src/a'))

    const watcher = watch(root)
    onTestFinished(() => watcher.close())
    await treeImports(root, './a/one')

    await unlink(configFile)
    await sleep(rewriteAfter)
    await writeFile(configFile, configFor(root, './src/b'))

    const tree = await treeImports(root, './b/two')
    expect(tree).not.toContain(`'./a/one'`)
    expect(reported).toEqual([])
  },
)
