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
