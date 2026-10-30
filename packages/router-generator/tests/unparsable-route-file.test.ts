/**
 * A route file that does not parse when the generator starts (a fresh
 * `tsr generate`, a build, a dev server start): no earlier generation of the
 * session knows its route.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { Generator, getConfig } from '../src'
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

// Regression: main's `run()` rejected naming the file (`tsr generate` exited
// 1); the cold run now only warns and writes a tree without the route, so
// the app builds and the route 404s.
test.fails(
  'a cold generation with a route file that does not parse fails naming the file, or keeps its route',
  async () => {
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
    }
  },
)
