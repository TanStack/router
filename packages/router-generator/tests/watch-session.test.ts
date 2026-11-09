/**
 * A watch session (`createGeneratorSession().watch()`, the generator's own
 * chokidar watcher, as Rspack, webpack and the CLI run it) under file
 * operations that replace several files at once: a git operation, a deleted
 * `.tanstack/` directory. The outcome is the route tree on disk, loaded by the
 * real router, and the routes the session hands over. Also what a session
 * says of a temporary directory git does not ignore.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, onTestFinished, test } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import {
  captureDiagnostics,
  expectNoProblems,
} from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { Generator, createGeneratorSession, replaceBackslash } from '../src'
import { configOf, createApp, fileRoute, rootRoute, save } from './app'
import { routesOf } from './route-tree'
import type { Config, GetRoutesByFileMapResult } from '../src'

/** A watch session on the app at `root`, once it watches and ran. */
async function watchApp(root: string, config: Config) {
  const reported: Array<string> = []
  let routes: GetRoutesByFileMapResult = new Map()
  const generator = new Generator({ config, root })
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

describe('a temporary directory git does not ignore', () => {
  /** An app in a git work tree of its own, with these `.gitignore` lines. */
  const gitApp = async (gitignore?: string) => {
    const root = await createApp({
      ...app,
      ...(gitignore === undefined ? {} : { '.gitignore': gitignore }),
    })
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    return root
  }
  const logged = (root: string) => configOf(root, { disableLogging: false })

  // `git stash -u` and `git clean -fd` delete it under the running session
  test('a watch session in a git work tree that does not ignore it warns once, naming the .gitignore', async () => {
    const root = await gitApp()
    const config = logged(root)
    const { diagnostics } = await captureDiagnostics(async () => {
      const session = await watchApp(root, config)
      await save(root, 'src/routes/b.tsx', fileRoute('/b'))
      await waitForOutcome({
        applied: () => session.routeFiles().includes('src/routes/b.tsx'),
        problems: () => session.reported,
        timeout: 10_000,
        describe: () => session.routeFiles().join(', '),
      })
      // a second session of the process: checked already
      await watchApp(root, config)
    })
    expectDiagnostic(diagnostics, {
      severity: 'warning',
      file: '.gitignore',
      root,
      times: 1,
    })
  })

  test.each([
    { name: '.tanstack', gitignore: '.tanstack\n' },
    { name: '.tanstack/', gitignore: 'node_modules\n.tanstack/\n' },
    { name: '**/.tanstack', gitignore: '**/.tanstack\n' },
  ])(
    'a watch session in a git work tree that ignores it with $name says nothing',
    async ({ gitignore }) => {
      const root = await gitApp(gitignore)
      const { diagnostics } = await captureDiagnostics(() =>
        watchApp(root, logged(root)),
      )
      expectNoProblems(diagnostics)
    },
  )

  test('a watch session outside any git work tree says nothing', async (context) => {
    const root = await createApp(app)
    try {
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: root,
        stdio: 'ignore',
      })
      // (the run directory is inside a git work tree on this machine)
      context.skip()
    } catch {
      // not in a work tree: the case under test
    }
    const { diagnostics } = await captureDiagnostics(() =>
      watchApp(root, logged(root)),
    )
    expectNoProblems(diagnostics)
  })
})
