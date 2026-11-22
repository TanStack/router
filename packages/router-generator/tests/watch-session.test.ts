/**
 * A watch session (`createGeneratorSession().watch()`, the generator's own
 * chokidar watcher, as Rspack, webpack and the CLI run it) under file
 * operations that replace several files at once: a git operation, a deleted
 * `.tanstack/` directory. The outcome is the route tree on disk, loaded by the
 * real router, and the routes the session hands over.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, onTestFinished, test, vi } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import {
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { Generator, createGeneratorSession, replaceBackslash } from '../src'
import { configOf, createApp, fileRoute, rootRoute, save } from './app'
import { routesOf } from './route-tree'
import type { Config, GetRoutesByFileMapResult } from '../src'

/** A watch session on the app at `root`, once it watches and ran. */
async function watchApp(
  root: string,
  config: Config,
  generator = new Generator({ config, root }),
) {
  const reported: Array<string> = []
  let routes: GetRoutesByFileMapResult = new Map()
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (routesByFile) => {
      routes = routesByFile
    },
    report: (error) => reported.push(String(error)),
  })
  onTestFinished(() => session.close())
  await session.watch()
  return {
    reported,
    /** The route files of the routes the session handed over last. */
    routeFiles: () =>
      [...routes.keys()].map((file) =>
        path.relative(root, file).split(path.sep).join('/'),
      ),
  }
}

const app = {
  'src/routes/__root.tsx': rootRoute(),
  'src/routes/index.tsx': fileRoute('/'),
  'src/routes/a.tsx': fileRoute('/a'),
}
const appRoutes = {
  __root__: 'routes/__root.tsx',
  '/': 'routes/index.tsx',
  '/a': 'routes/a.tsx',
}

// Bug: a git operation that deletes a route file and writes the committed
// route tree (`git stash push -u` of a new route, `reset --hard`, a branch
// switch back) makes the generator write a route tree that imports the
// deleted file, until the delete's event comes.
// Source: src/generator.ts `processBatch()`: the route tree event comes
// first (chokidar reports a delete ~100 ms after the other events of the
// operation); the tree on disk is not the one published, and the batch,
// which has no structural event, prints the routes of its last scan.
// Impact: in dev, SSR fails to load the deleted file for that window, and
// every tab reloaded in it stays on an error page until reloaded by hand.
test('a route tree written as a route file is deleted is never replaced by one that imports the deleted file', async () => {
  const root = await createApp(app)
  const config = configOf(root)
  await new Generator({ config, root }).run()
  const committed = await readFile(config.generatedRouteTree, 'utf8')
  const extra = await save(root, 'src/routes/extra.tsx', fileRoute('/extra'))
  const session = await watchApp(root, config)
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    ...appRoutes,
    '/extra': 'routes/extra.tsx',
  })

  // One operation, as git makes it
  writeFileSync(config.generatedRouteTree, committed)
  rmSync(extra)

  // Every content the route tree file holds from then on
  const seen = new Set<string>()
  const sampling = new AbortController()
  const sampler = (async () => {
    while (!sampling.signal.aborted) {
      try {
        seen.add(readFileSync(config.generatedRouteTree, 'utf8'))
      } catch {
        // (between a rename's two steps on some platforms)
      }
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  })()

  try {
    await waitForOutcome({
      applied: async () =>
        !session.routeFiles().includes('src/routes/extra.tsx') &&
        (await readFile(config.generatedRouteTree, 'utf8')) === committed,
      problems: () => session.reported,
      timeout: 10_000,
      describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
    })
  } finally {
    sampling.abort()
    await sampler
  }

  // Each tree the file held loads with the app's files (the deleted one gone)
  const observed = path.join(path.dirname(config.generatedRouteTree), 'seen')
  let index = 0
  for (const content of seen) {
    const file = `${observed}-${index++}.gen.ts`
    await writeFile(file, content)
    expect(await routesOf(file)).toEqual(appRoutes)
  }
  expect(await routesOf(config.generatedRouteTree)).toEqual(appRoutes)
})

// Bug: once `.tanstack/` (the default temporary directory) is deleted under
// a watch session (`git stash -u` or `git clean -fd` in a repository that
// does not ignore it, `rm -rf .tanstack`), every route tree write fails
// with ENOENT until the session restarts.
// Source: src/publish/atomic.ts `write()`: the temporary directory is
// created once, and its creation remembered.
// Impact: added routes 404, deleted routes stay imported, until restart.
test('after the temporary directory is deleted, an added route reaches the route tree', async () => {
  const root = await createApp(app)
  const config = configOf(root)
  const session = await watchApp(root, config)
  await save(root, 'src/routes/b.tsx', fileRoute('/b'))
  await waitForOutcome({
    applied: () => session.routeFiles().includes('src/routes/b.tsx'),
    problems: () => session.reported,
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })

  expect(replaceBackslash(config.tmpDir)).toBe(
    replaceBackslash(path.join(root, '.tanstack/tmp')),
  )
  await rm(path.join(root, '.tanstack'), { recursive: true, force: true })
  await save(root, 'src/routes/c.tsx', fileRoute('/c'))

  await waitForOutcome({
    applied: () => session.routeFiles().includes('src/routes/c.tsx'),
    problems: () => session.reported,
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    ...appRoutes,
    '/b': 'routes/b.tsx',
    '/c': 'routes/c.tsx',
  })
})

// Bug: an edit of a route file a virtual route config names outside the
// routes directory and every `physical()` mount
// (`route('/item', '../external/item.tsx')`) never reached the generator
// under its own watcher (`tsr watch`, Rspack, webpack).
// Source: src/generator.ts `watchTargets()` listed directories only.
// Impact: the route keeps the file's content of the last scan until another
// event rescans or the session restarts.
test('an edit of a route file the virtual route config names outside the routes directory is handled', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/external/item.tsx': fileRoute('/item'),
  })
  const config = configOf(root, {
    virtualRouteConfig: virtualRootRoute('__root.tsx', [
      virtualRoute('/item', '../external/item.tsx'),
    ]),
  })
  const session = await watchApp(root, config)
  const item = await save(root, 'src/external/item.tsx', fileRoute('/wrong'))
  await waitForOutcome({
    applied: async () => (await readFile(item, 'utf8')).includes(`'/item'`),
    problems: () => session.reported,
    timeout: 10_000,
    describe: () => readFileSync(item, 'utf8'),
  })
})

// Bug: a save of a route file right after the generator handled the
// previous one, within 50 ms of it (a tool or a script writing the file
// twice, a format-on-save after the save), never reached the generator: it
// kept the content of the first save.
// Source: chokidar 5 dropped a change within 50 ms of the previous one of
// the file (fixed in chokidar 6, which reports it at the end of the window).
// Impact: under `tsr watch`, Rspack and webpack watch mode, Rsbuild dev and
// `vite build --watch`, the route stays as the first save left it until the
// file is saved again or the session restarts.
test('a save of a route file right after the generator handled the previous one is handled', async () => {
  const root = await createApp({ ...app, 'src/routes/b.tsx': 'export {}\n' })
  const config = configOf(root)
  const generator = new Generator({ config, root })
  const b = path.join(root, 'src/routes/b.tsx')
  // The second save, as soon as the run of the first one's event ended
  // (the generator read the first save)
  const run = generator.run.bind(generator)
  let saves = 0
  vi.spyOn(generator, 'run').mockImplementation((event) => {
    const started = run(event)
    if (event && 'path' in event && path.basename(event.path) === 'b.tsx') {
      if (saves++ === 0) {
        void started.then(() => writeFile(b, fileRoute('/b')))
      }
    }
    return started
  })
  const session = await watchApp(root, config, generator)

  await writeFile(b, 'export const draft = true\n')

  await waitForOutcome({
    applied: () => session.routeFiles().includes('src/routes/b.tsx'),
    problems: () => session.reported,
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    ...appRoutes,
    '/b': 'routes/b.tsx',
  })
})

// Bug: once the routes directory was deleted and created again (a branch
// switch or `git stash -u` that removes it, a scaffolding tool that rewrites
// it), no event of its files reached the generator.
// Source: chokidar 5 stopped watching a deleted directory it was given
// (fixed in chokidar 6, which watches it again once it exists).
// Impact: under `tsr watch`, Rspack and webpack watch mode, Rsbuild dev and
// `vite build --watch`, added, edited and deleted routes never reach the
// route tree until the session restarts.
test('after the routes directory is deleted and created again, its routes reach the route tree', async () => {
  const root = await createApp(app)
  const config = configOf(root)
  // (an app whose route tree was generated before)
  await new Generator({ config, root }).run()
  const session = await watchApp(root, config)

  await rm(path.join(root, 'src/routes'), {
    recursive: true,
    force: true,
    maxRetries: 5,
  })
  // The generator's next run fails: it cannot scan the routes directory
  await waitForOutcome({
    applied: () => session.reported.some((error) => error.includes('ENOENT')),
    timeout: 10_000,
    describe: () => `reported: ${session.reported.join(', ')}`,
  })

  session.reported.length = 0
  for (const [file, content] of Object.entries(app)) {
    await save(root, file, content)
  }
  await save(root, 'src/routes/b.tsx', fileRoute('/b'))

  await waitForOutcome({
    applied: () => session.routeFiles().includes('src/routes/b.tsx'),
    problems: () => session.reported,
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    ...appRoutes,
    '/b': 'routes/b.tsx',
  })
})

// A session closed while a run of its watcher is in flight, a run that
// finds a `physical()` mount to watch (`tsr watch` closes its session when
// `tsr.config.json` changes, the bundler plugins when their config does):
// the run ends and hands over its routes, and nothing is added to the
// closed watcher (chokidar 6 throws then).
test('a session closed while a run that adds a physical() mount is in flight lets the run end', async () => {
  const routeConfig = (mounts: string) =>
    `import { physical, rootRoute, route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('__root.tsx', [route('/a', 'a.tsx')${mounts}])
`
  const root = await createApp({
    'routes.ts': routeConfig(''),
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/a.tsx': fileRoute('/a'),
    'src/legacy/b.tsx': fileRoute('/legacy/b'),
  })
  const config = configOf(root, { virtualRouteConfig: './routes.ts' })
  const generator = new Generator({ config, root })
  let routes: GetRoutesByFileMapResult = new Map()
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (routesByFile) => {
      routes = routesByFile
    },
  })
  onTestFinished(() => session.close())
  await session.watch()
  const routeFiles = () =>
    [...routes.keys()].map((file) =>
      path.relative(root, file).split(path.sep).join('/'),
    )

  // The run of the config edit's event, once the watcher reports it
  const run = generator.run.bind(generator)
  let configRunStarted = (_started: { run: Promise<void> }) => {}
  const configRun = new Promise<{ run: Promise<void> }>((resolve) => {
    configRunStarted = resolve
  })
  vi.spyOn(generator, 'run').mockImplementation((event) => {
    const started = run(event)
    if (event && 'path' in event && path.basename(event.path) === 'routes.ts') {
      configRunStarted({ run: started })
    }
    return started
  })
  await save(
    root,
    'routes.ts',
    routeConfig(`, physical('/legacy', '../legacy')`),
  )
  const inFlight = (await configRun).run
  await session.close()

  await inFlight
  // The session hands over the routes of the run (after it refreshed the
  // watcher's targets, which a closed session does not)
  await waitForOutcome({
    applied: () => routeFiles().includes('src/legacy/b.tsx'),
    timeout: 10_000,
    describe: () => `routes handed over: ${routeFiles().join(', ')}`,
  })
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    __root__: 'routes/__root.tsx',
    '/a': 'routes/a.tsx',
    '/legacy/b': 'legacy/b.tsx',
  })
})
