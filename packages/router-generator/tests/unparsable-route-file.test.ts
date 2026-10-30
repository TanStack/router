/**
 * A route file that does not parse. When the generator starts (a fresh
 * `tsr generate`, a build, a dev server start) no earlier generation of the
 * session knows its route: the run fails naming the file, as on main. In a
 * session that knew it (dev, watch), it keeps its route and is reported.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

function configOf(root: string) {
  return getConfig(
    {
      disableLogging: true,
      routesDirectory: path.join(root, 'src/routes'),
      generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
      tmpDir: path.join(root, '.tanstack/tmp'),
    },
    root,
  )
}

// Main's `run()` rejected naming the file (`tsr generate` exited 1).
test('a cold generation with a route file that does not parse fails naming the file, or keeps its route', async () => {
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
  const failure = await generator.run().then(
    () => undefined,
    (error: unknown) => error,
  )
  if (failure === undefined) {
    expect([...generator.getRoutesByFileMap().keys()]).toContain(posts)
  } else {
    expect(String(failure)).toContain('posts.tsx')
    expect(await readFile(tree, 'utf8')).toBe(committed)
  }
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
