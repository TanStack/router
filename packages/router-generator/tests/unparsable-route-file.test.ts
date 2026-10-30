/**
 * A route file that does not parse. When the generator starts (a fresh
 * `tsr generate`, a build, a dev server start) no earlier generation of the
 * session knows its route: the run fails naming the file, as on main. In a
 * session that knew it (dev, watch), it keeps its route and is reported.
 */
import { writeFileSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator, createGeneratorSession, getConfig } from '../src'
import { recordInputs } from './consumer-inputs'

const roots: Array<string> = []
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function createApp(files: Record<string, string>) {
  const root = await mkdtemp(path.join(runDirectory(), 'tsr-unparsable-'))
  roots.push(root)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  recordInputs(root, files)
  return root
}

function configOf(root: string, overrides: Record<string, unknown> = {}) {
  return getConfig(
    {
      disableLogging: true,
      routesDirectory: path.join(root, 'src/routes'),
      generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
      tmpDir: path.join(root, '.tanstack/tmp'),
      ...overrides,
    },
    root,
  )
}

// Main's `run()` rejected naming the file (`tsr generate` exited 1).
test('a cold generation with a route file that does not parse fails naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
    'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  // The committed tree lists `/posts`
  await new Generator({ config: configOf(root), root }).run()
  const tree = path.join(root, 'src/routeTree.gen.ts')
  const committed = await readFile(tree, 'utf8')

  await writeFile(posts, 'export const Route = (')
  const generator = new Generator({ config: configOf(root), root })
  await expect(generator.run()).rejects.toThrow('posts.tsx')
  expect(await readFile(tree, 'utf8')).toBe(committed)
})

test('a route file an edit breaks in a running generator keeps its route and is reported', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
    'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
  })
  const config = configOf(root)
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config, root })
  await generator.run()
  const tree = await readFile(config.generatedRouteTree, 'utf8')

  await writeFile(posts, 'export const Route = (')
  const { diagnostics } = await captureDiagnostics(() =>
    generator.run({ type: 'update', path: posts }),
  )
  expectDiagnostic(diagnostics, {
    severity: 'warning',
    file: posts,
    root,
    position: { line: 1 },
  })
  expect([...generator.getRoutesByFileMap().keys()]).toContain(posts)
  expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(tree)
})

// A dev server's first generation (the hosts run it through a session) with
// a route file that does not parse: the server goes on, the failure names
// the file and the committed tree keeps the route, as on main.
test('a dev server starting with a route file that does not parse reports it and keeps the committed tree', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
    'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`,
  })
  const config = configOf(root)
  await new Generator({ config, root }).run()
  const committed = await readFile(config.generatedRouteTree, 'utf8')

  const posts = path.join(root, 'src/routes/posts.tsx')
  await writeFile(posts, 'export const Route = (')
  const reports: Array<unknown> = []
  const generator = new Generator({ config, root })
  await createGeneratorSession({
    generator: () => generator,
    report: (error) => reports.push(error),
  }).run()
  expect(reports.map(String)).toEqual([expect.stringContaining('posts.tsx')])
  expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(committed)
})

// A build that does not watch runs the generator through the same session:
// there the failure fails the build.
test('a build starting with a route file that does not parse fails, naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
    'src/routes/posts.tsx': 'export const Route = (',
  })
  const generator = new Generator({ config: configOf(root), root })
  await expect(
    createGeneratorSession({ generator: () => generator }).build(),
  ).rejects.toThrow('posts.tsx')
})

// Other failures of a build's generation (here two routes with one URL) are
// reported and the build goes on with the tree on disk, as on main.
test('a build whose generation fails for another reason reports it and goes on', async () => {
  const route = (
    id: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('${id}')({})
`
  const root = await createApp({
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
    'src/routes/index.tsx': route('/'),
    'src/routes/_auth/index.tsx': route('/_auth/'),
  })
  const reports: Array<unknown> = []
  const generator = new Generator({ config: configOf(root), root })
  await createGeneratorSession({
    generator: () => generator,
    report: (error) => reports.push(error),
  }).build()
  expect(reports.map(String)).toEqual([
    expect.stringContaining('_auth/index.tsx'),
  ])
})

const rootRoute = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`
const postsRoute = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({})
`

// The root route file too: a cold run reads every route file.
test('a cold generation with a root route file that does not parse fails naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const config = configOf(root)
  await new Generator({ config, root }).run()
  const committed = await readFile(config.generatedRouteTree, 'utf8')

  await writeFile(
    path.join(root, 'src/routes/__root.tsx'),
    'export const Route = (',
  )
  await expect(new Generator({ config, root }).run()).rejects.toThrow(
    '__root.tsx',
  )
  expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(committed)
})

test('a root route file an edit breaks in a running generator keeps the tree and is reported', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const config = configOf(root)
  const rootFile = path.join(root, 'src/routes/__root.tsx')
  const generator = new Generator({ config, root })
  await generator.run()
  const tree = await readFile(config.generatedRouteTree, 'utf8')

  await writeFile(rootFile, 'export const Route = (')
  const { diagnostics } = await captureDiagnostics(() =>
    generator.run({ type: 'update', path: rootFile }),
  )
  expectDiagnostic(diagnostics, {
    severity: 'warning',
    file: rootFile,
    root,
    position: { line: 1 },
  })
  expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(tree)
})

// A plugin instance can build more than once in one process (a bundler's
// `run()` called again, a programmatic build repeated): each build is a
// run that does not watch, whatever an earlier one read.
test('a build of a generator that built before fails when a route file no longer parses, naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const config = configOf(root)
  const generator = new Generator({ config, root })
  const session = createGeneratorSession({ generator: () => generator })
  await session.build()
  const tree = await readFile(config.generatedRouteTree, 'utf8')

  await writeFile(
    path.join(root, 'src/routes/posts.tsx'),
    'export const Route = (',
  )
  await expect(session.build()).rejects.toThrow('posts.tsx')
  expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(tree)
})

// The route a watch run kept for a broken file is no route of a build.
test('a build after a watch run that kept the route of a broken file fails, naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const config = configOf(root)
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config, root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  await writeFile(posts, 'export const Route = (')
  await captureDiagnostics(() => session.run({ type: 'update', path: posts }))
  expect([...generator.getRoutesByFileMap().keys()]).toContain(posts)
  await expect(session.build()).rejects.toThrow('posts.tsx')
})

// A build's outcome is its drain's last batch: an event that arrives while
// it generates (no host sends one; here the generator's own `run`, one
// microtask later, once the drain took the build's batch) is a build too,
// so it fails on the broken file rather than keep its last good route.
test('a build fails on a route file that does not parse when another event arrives while it generates', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const config = configOf(root)
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config, root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  const tree = await readFile(config.generatedRouteTree, 'utf8')
  await writeFile(posts, 'export const Route = (')
  const built = session.build()
  await Promise.resolve()
  const later = generator.run({
    type: 'update',
    path: path.join(root, 'src/routes/__root.tsx'),
  })
  await expect(built).rejects.toThrow('posts.tsx')
  await expect(later).rejects.toThrow('posts.tsx')
  expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(tree)
})

// A build arriving while a dev batch generates: the drain's last batch is the
// build's, whatever the first waiter asked for.
test('a build arriving during a dev batch fails on a route file that does not parse', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config: configOf(root), root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  await writeFile(posts, 'export const Route = (')
  const dev = session.run({ type: 'update', path: posts })
  await Promise.resolve()
  await Promise.resolve()
  await expect(session.build()).rejects.toThrow('posts.tsx')
  await dev
})

test('a build resolves when an event arriving while it generates fixes the route file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config: configOf(root), root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  await writeFile(posts, 'export const Route = (')
  const built = session.build()
  await Promise.resolve()
  await writeFile(posts, postsRoute)
  await generator.run({ type: 'update', path: posts })
  await built
  expect([...generator.getRoutesByFileMap().keys()]).toContain(posts)
})

// A build batch that fails before publishing still read what changed: the
// next batch publishes it, though the file that broke it is all it reads.
test('a route change a failed build read reaches the tree once the broken file is fixed', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
    'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({})
`,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const about = path.join(root, 'src/routes/about.tsx')
  const config = configOf(root)
  let armed = false
  const runs: Array<Promise<void>> = []
  config.plugins = [
    {
      name: 'edits-during-the-build',
      // synchronous: the events join the drain of the batch that notifies
      onRouteTreeChanged: () => {
        if (armed) {
          armed = false
          writeFileSync(about, 'export const notARoute = 1\n')
          writeFileSync(posts, 'export const Route = (')
          runs.push(
            generator.run({ type: 'update', path: about }),
            generator.run({ type: 'update', path: posts }),
          )
        }
      },
    },
  ]
  const generator = new Generator({ config, root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  armed = true
  await expect(session.build()).rejects.toThrow('posts.tsx')
  await Promise.allSettled(runs)
  await writeFile(posts, postsRoute)
  await session.run({ type: 'update', path: posts })
  expect(await readFile(config.generatedRouteTree, 'utf8')).not.toContain(
    "'/about'",
  )
})

// Whatever else fails in a build's generation, a route file that does not
// parse fails the build: a failure of another kind is only reported, and
// would otherwise win by arriving first.
test('a build fails on a route file known not to parse when the root route is gone too', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config: configOf(root), root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  await writeFile(posts, 'export const Route = (')
  await captureDiagnostics(() => session.run({ type: 'update', path: posts }))
  await rm(path.join(root, 'src/routes/__root.tsx'))
  await expect(session.build()).rejects.toThrow('posts.tsx')
})

// The scan failed, so the build read nothing: the file is known broken only
// while it still holds what broke it.
test.each([
  ['fixed', (posts: string) => writeFile(posts, postsRoute)],
  ['deleted', (posts: string) => rm(posts)],
])(
  'a build reports a gone root route when the route file known not to parse was %s',
  async (_, change) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute,
      'src/routes/posts.tsx': postsRoute,
    })
    const posts = path.join(root, 'src/routes/posts.tsx')
    const reports: Array<unknown> = []
    const generator = new Generator({ config: configOf(root), root })
    const session = createGeneratorSession({
      generator: () => generator,
      report: (error) => reports.push(error),
    })
    await session.run()
    await writeFile(posts, 'export const Route = (')
    await captureDiagnostics(() => session.run({ type: 'update', path: posts }))
    await change(posts)
    await rm(path.join(root, 'src/routes/__root.tsx'))
    await session.build()
    expect(reports).toHaveLength(1)
  },
)

test('a build names a route file known not to parse and one that never did', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config: configOf(root), root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  await writeFile(posts, 'export const Route = (')
  await captureDiagnostics(() => session.run({ type: 'update', path: posts }))
  await writeFile(
    path.join(root, 'src/routes/about.tsx'),
    'export const Route = (',
  )
  const built = session.build()
  await expect(built).rejects.toThrow('posts.tsx')
  await expect(built).rejects.toThrow('about.tsx')
})

// (A symbolic link to itself: no read of it succeeds, for any user.)
test.each(['a-unreadable.tsx', 'z-unreadable.tsx'])(
  'a cold build fails on a route file that does not parse next to an unreadable one (%s)',
  async (unreadable) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute,
      'src/routes/posts.tsx': 'export const Route = (',
    })
    const link = path.join(root, 'src/routes', unreadable)
    await symlink(link, link)
    const generator = new Generator({ config: configOf(root), root })
    await expect(
      createGeneratorSession({
        generator: () => generator,
        report: () => {},
      }).build(),
    ).rejects.toThrow('posts.tsx')
  },
)

test('a build fails on a route file known not to parse next to an unreadable one', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config: configOf(root), root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  await session.run()
  await writeFile(posts, 'export const Route = (')
  await captureDiagnostics(() => session.run({ type: 'update', path: posts }))
  const link = path.join(root, 'src/routes/about.tsx')
  await symlink(link, link)
  await expect(session.build()).rejects.toThrow('posts.tsx')
})

test('a cold build names every route file that does not parse', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/about.tsx': 'export const Route = (',
    'src/routes/posts.tsx': 'export const Route = (',
  })
  const generator = new Generator({ config: configOf(root), root })
  const built = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  }).build()
  await expect(built).rejects.toThrow('about.tsx')
  await expect(built).rejects.toThrow('posts.tsx')
})

// A build reads what it builds: a file whose size and modification time did
// not change (an overwrite within the file system's clock tick) is read too.
test('a build fails on a route file an overwrite of the same size and time broke', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute,
    'src/routes/posts.tsx': postsRoute,
  })
  const posts = path.join(root, 'src/routes/posts.tsx')
  const generator = new Generator({ config: configOf(root), root })
  const session = createGeneratorSession({
    generator: () => generator,
    report: () => {},
  })
  const time = new Date(1_700_000_000_000)
  await utimes(posts, time, time)
  await session.run()
  const before = await stat(posts)
  await writeFile(posts, '('.repeat(before.size))
  await utimes(posts, time, time)
  expect((await stat(posts)).mtimeMs).toBe(before.mtimeMs)
  await expect(session.build()).rejects.toThrow('posts.tsx')
})

// Text that names no `Route` and does not parse is no route file without a
// route: the run fails as for any route file that does not parse.
test.each([['import { createFileRo'], ['export const = (']])(
  'a cold generation and a build with a route file `%s` that names no Route fail naming the file',
  async (content) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute,
      'src/routes/posts.tsx': content,
    })
    const generator = () => new Generator({ config: configOf(root), root })
    await expect(generator().run()).rejects.toThrow('posts.tsx')
    const built = generator()
    await expect(
      createGeneratorSession({ generator: () => built }).build(),
    ).rejects.toThrow('posts.tsx')
  },
)

// A Vue root is a single-file component, which the generator never parses
// (its script is not the file's text).
test('a Vue root route file generates', async () => {
  const root = await createApp({
    'src/routes/__root.vue': `<script lang="ts">
import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
</script>
<template><RouterView /></template>
`,
    'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/posts')({})
`,
  })
  const config = configOf(root, { target: 'vue' })
  await new Generator({ config, root }).run()
  expect(await readFile(config.generatedRouteTree, 'utf8')).toContain(
    '__root.vue',
  )
})

// A route file outside the routes directory (a virtual route config's
// root) that a dev server's first generation could not read: an event of it
// generates once it parses.
test('a virtual root route outside the routes directory that did not parse at dev start generates once fixed', async () => {
  const root = await createApp({
    'src/layouts/root.tsx': 'export const Route = (',
    'src/routes/posts.tsx': postsRoute,
  })
  const config = configOf(root, {
    virtualRouteConfig: {
      type: 'root',
      file: '../layouts/root.tsx',
      children: [{ type: 'route', file: 'posts.tsx', path: '/posts' }],
    },
  })
  const generator = new Generator({ config, root })
  const reports: Array<unknown> = []
  const session = createGeneratorSession({
    generator: () => generator,
    report: (error) => reports.push(error),
  })
  await session.run()
  expect(reports.map(String)).toEqual([expect.stringContaining('root.tsx')])
  const rootFile = path.join(root, 'src/layouts/root.tsx')
  await writeFile(rootFile, rootRoute)
  await session.run({ type: 'update', path: rootFile })
  expect(await readFile(config.generatedRouteTree, 'utf8')).toContain('posts')
})
