/**
 * A watch session (`createGeneratorSession().watch()`, the generator's own
 * chokidar watcher, as Rspack, webpack and the CLI run it) under file
 * operations that replace several files at once: a git operation, a deleted
 * `.tanstack/` directory. The outcome is the route tree on disk, loaded by the
 * real router, and the routes the session hands over.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { chmod, open, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, onTestFinished, vi } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import {
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { Generator, createGeneratorSession, replaceBackslash } from '../src'
import { configOf, fileRoute, rootRoute, save } from './app'
import { test } from './test'
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
test('a route tree written as a route file is deleted is never replaced by one that imports the deleted file', async ({
  createApp,
  routesOf,
}) => {
  const root = await createApp(app)
  const config = configOf(root)
  await new Generator({ config, root }).run()
  const committed = await readFile(config.generatedRouteTree, 'utf8')
  const extra = await save(root, 'src/routes/extra.tsx', fileRoute('/extra'))
  // Every content the generator publishes as the route tree file from the
  // operation on, read as each write lands (`onWrite`: once it is renamed
  // in place, before anything else runs)
  const published = new Set<string>()
  let recording = false
  const session = await watchApp(
    root,
    config,
    new Generator({
      config,
      root,
      onWrite: ({ destination }) => {
        if (recording && destination === config.generatedRouteTree) {
          published.add(readFileSync(destination, 'utf8'))
        }
      },
    }),
  )
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    ...appRoutes,
    '/extra': 'routes/extra.tsx',
  })

  // One operation, as git makes it
  recording = true
  writeFileSync(config.generatedRouteTree, committed)
  rmSync(extra)

  await waitForOutcome({
    applied: async () =>
      !session.routeFiles().includes('src/routes/extra.tsx') &&
      (await readFile(config.generatedRouteTree, 'utf8')) === committed,
    problems: () => session.reported,
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })

  // Each tree the generator published loads with the app's files (the
  // deleted one gone)
  const observed = path.join(path.dirname(config.generatedRouteTree), 'seen')
  let index = 0
  for (const content of published) {
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
test('after the temporary directory is deleted, an added route reaches the route tree', async ({
  createApp,
  routesOf,
}) => {
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
test('an edit of a route file the virtual route config names outside the routes directory is handled', async ({
  createApp,
}) => {
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

/**
 * Saves an app file in place, as an editor that writes the file itself does:
 * its content never empty in between (an empty route file is one the
 * generator scaffolds).
 */
async function saveInPlace(file: string, content: string) {
  const handle = await open(file, 'r+')
  try {
    await handle.write(content, 0)
    await handle.truncate(Buffer.byteLength(content))
  } finally {
    await handle.close()
  }
}

// Bug: a save of a route file right after the generator handled the
// previous one, within 50 ms of it (a tool or a script writing the file
// twice, a format-on-save after the save), could never reach the generator:
// it kept the content of the first save.
// Source: chokidar 5 dropped a change within 50 ms of the previous one of
// the file (fixed in chokidar 6, which reports it at the end of the window,
// or as a change of its own after it).
// Impact: under `tsr watch`, Rspack and webpack watch mode, Rsbuild dev and
// `vite build --watch`, the route stays as the first save left it until the
// file is saved again or the session restarts.
// (With chokidar 5 the second save lands in the window only when the run of
// the first one and the event loop take less than 50 ms: the test fails on
// it on a quick machine, not on every one.)
test('a save of a route file right after the generator handled the previous one is handled', async ({
  createApp,
  routesOf,
}) => {
  const root = await createApp({
    ...app,
    'src/routes/b.tsx': 'export {}\n',
  })
  const config = configOf(root)
  const generator = new Generator({ config, root })
  const b = path.join(root, 'src/routes/b.tsx')
  // The second save, as soon as the run of the first one's event ended (the
  // generator read the first save)
  const run = generator.run.bind(generator)
  const saveFailures: Array<string> = []
  let secondSave: Promise<void> | undefined
  vi.spyOn(generator, 'run').mockImplementation((event) => {
    const started = run(event)
    if (
      !secondSave &&
      event &&
      'path' in event &&
      path.basename(event.path) === 'b.tsx'
    ) {
      secondSave = started
        .then(() => saveInPlace(b, fileRoute('/b')))
        .catch((error: unknown) => {
          saveFailures.push(String(error))
        })
    }
    return started
  })
  const session = await watchApp(root, config, generator)

  await saveInPlace(b, 'export const draft = true\n')

  await waitForOutcome({
    applied: () => session.routeFiles().includes('src/routes/b.tsx'),
    problems: () => [...session.reported, ...saveFailures],
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })
  await secondSave
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
test('after the routes directory is deleted and created again, its routes reach the route tree', async ({
  createApp,
  routesOf,
}) => {
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
  // The generator notices the lost route files: its run fails (no root
  // route, no routes directory)
  await waitForOutcome({
    applied: () => session.reported.length > 0,
    timeout: 10_000,
    describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
  })

  for (const [file, content] of Object.entries(app)) {
    await save(root, file, content)
  }
  await save(root, 'src/routes/b.tsx', fileRoute('/b'))

  // (runs of the deletion's events may still fail meanwhile)
  await waitForOutcome({
    applied: () => session.routeFiles().includes('src/routes/b.tsx'),
    timeout: 10_000,
    describe: () =>
      `routes handed over: ${session.routeFiles().join(', ')}\nreported: ${session.reported.join('\n')}`,
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
test('a session closed while a run that adds a physical() mount is in flight lets the run end', async ({
  createApp,
  routesOf,
}) => {
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

  // The runs from the config edit's event on, as the session gets them: they
  // end once the session is closed (`release`), so none refreshes the
  // watcher before
  const run = generator.run.bind(generator)
  let release = () => {}
  const closed = new Promise<void>((resolve) => {
    release = resolve
  })
  let observed = (_run: { run: Promise<void> }) => {}
  const configRun = new Promise<{ run: Promise<void> }>((resolve) => {
    observed = resolve
  })
  let holding = false
  vi.spyOn(generator, 'run').mockImplementation((event) => {
    const started = run(event)
    const configEvent =
      event !== undefined &&
      'path' in event &&
      path.basename(event.path) === 'routes.ts'
    if (!holding && !configEvent) {
      return started
    }
    const held = Promise.all([started, closed]).then(() => undefined)
    if (!holding) {
      holding = true
      observed({ run: held })
    }
    return held
  })
  await save(
    root,
    'routes.ts',
    routeConfig(`, physical('/legacy', '../legacy')`),
  )
  const inFlight = (await configRun).run
  await session.close()
  release()

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

// Bug: an error of the watcher (a path it cannot watch) ended the process
// of `tsr watch`, Rspack and webpack watch mode, Rsbuild dev and
// `vite build --watch`.
// Source: src/watch/chokidar.ts had no `error` listener.
// Case: a route file linked to a file in a directory that can be searched
// but not read, which chokidar 6 cannot watch (Linux, not as root: root
// reads every directory).
// Impact: the dev server or `tsr watch` exits at start.
test.runIf(process.platform === 'linux' && process.getuid?.() !== 0)(
  'a path the watcher cannot watch is reported, and the session keeps watching the others',
  async ({ createApp, routesOf }) => {
    const root = await createApp({
      ...app,
      'outside/b.tsx': fileRoute('/b'),
    })
    const config = configOf(root)
    const outside = path.join(root, 'outside')
    await symlink(
      path.join(outside, 'b.tsx'),
      path.join(root, 'src/routes/b.tsx'),
    )
    await chmod(outside, 0o111)
    onTestFinished(() => chmod(outside, 0o755))
    const session = await watchApp(root, config)
    expect(session.reported).not.toEqual([])

    await save(root, 'src/routes/c.tsx', fileRoute('/c'))
    await waitForOutcome({
      applied: () => session.routeFiles().includes('src/routes/c.tsx'),
      timeout: 10_000,
      describe: () => `routes handed over: ${session.routeFiles().join(', ')}`,
    })
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      ...appRoutes,
      // (the module loaded from the link's target)
      '/b': '../outside/b.tsx',
      '/c': 'routes/c.tsx',
    })
  },
)

// Bug: a session closed before its watcher finished its initial scan left
// `watch()` pending for ever: it waited for the watcher's `ready` event,
// which a closed watcher never emits.
// Impact: a host that closes the session early (a dev server stopped while
// it starts, a config change) never sees its `watch()` end.
// Source: external review of #8817 (design-routeset-v5.md §2.4).
test('a session closed before its watcher is ready ends its watch() without a run, and watches again on the next', async ({
  createApp,
  routesOf,
}) => {
  const root = await createApp(app)
  const config = configOf(root)
  const generator = new Generator({ config, root })
  let published = 0
  let routes: GetRoutesByFileMapResult = new Map()
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (routesByFile) => {
      published++
      routes = routesByFile
    },
  })
  const handedOver = (file: string) =>
    routes.has(replaceBackslash(path.join(root, file)))
  onTestFinished(() => session.close())
  const watching = session.watch()
  await session.close()
  const ended = await Promise.race([
    watching.then(() => 'ended'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 5_000)),
  ])
  expect(ended).toBe('ended')
  expect(published).toBe(0)

  // (by what it hands over, not by how often: the platform's watcher may
  // report the app's earlier writes after it is ready, macOS's FSEvents
  // backend among them, and every event is a run)
  await session.watch()
  expect(handedOver('src/routes/a.tsx')).toBe(true)
  expect(await routesOf(config.generatedRouteTree)).toEqual(appRoutes)
  await save(root, 'src/routes/b.tsx', fileRoute('/b'))
  await waitForOutcome({
    applied: () => handedOver('src/routes/b.tsx'),
    timeout: 10_000,
    describe: () => 'the session did not follow the route created',
  })
  expect(await routesOf(config.generatedRouteTree)).toEqual({
    ...appRoutes,
    '/b': 'routes/b.tsx',
  })
  await session.close()
})

// A host replaces its generator when its config changes, and the session
// reads the current one. The session's watcher kept the generator it was
// started with: once that one was retired, an edit was not repaired and a
// created route was not listed until the host watched again.
// The host's getter may be a method of its own (`generator()` reading
// `this`): the session calls it on the options object.
// Source: whole-PR review R2-30, VERIFY-router V-66; review of the generation
// record (Astra 3: the method form lost `this`).
test('after the host replaces the generator, the watcher hands each event to the current one', async ({
  createApp,
}) => {
  const root = await createApp(app)
  const config = configOf(root)
  const reported: Array<string> = []
  let routes: GetRoutesByFileMapResult = new Map()
  const host = {
    current: new Generator({ config, root }),
    generator() {
      return this.current
    },
    publish: (routesByFile: GetRoutesByFileMapResult) => {
      routes = routesByFile
    },
    report: (error: unknown) => reported.push(String(error)),
  }
  const session = createGeneratorSession(host)
  onTestFinished(() => session.close())
  await session.watch()
  host.current.retire()
  host.current = new Generator({ config, root })
  const generator = host.current
  await session.run()

  const created = await save(root, 'src/routes/new.tsx', fileRoute('/new'))
  await waitForOutcome({
    applied: () => routes.has(replaceBackslash(created)),
    problems: () => reported,
    timeout: 10_000,
    describe: () => `routes handed over: ${[...routes.keys()].join(', ')}`,
  })
  expect(generator.getRoutesByFileMap().has(replaceBackslash(created))).toBe(
    true,
  )
})

// The session handed a replacement generator's registry over with the error
// of the generator it replaced: the planners then failed every route module
// with that error until the new generator's first run.
// Source: whole-PR review R2-05 (Fable R2 #5, Astra R2 #13).
test('a generator that replaces a failed one is handed over without its failure', async ({
  createApp,
}) => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/a.tsx': 'export const Route = createFileRoute(\n',
  })
  const config = configOf(root)
  let generator = new Generator({ config, root })
  const failures: Array<unknown> = []
  const session = createGeneratorSession({
    generator: () => generator,
    publish: (_, failure) => failures.push(failure),
    report: () => {},
  })
  await session.run()
  expect(failures).toEqual([expect.any(Error)])

  const a = await save(root, 'src/routes/a.tsx', fileRoute('/a'))
  // (the host replaces the generator while a run of the retired one settles)
  const settling = session.run({ type: 'update', path: a })
  generator.retire()
  generator = new Generator({ config, root })
  await settling
  expect(failures.at(-1)).toBeUndefined()
})
