/**
 * Prerendering with automatic static path discovery (on by default) renders
 * every static route of the generated route tree that may render a
 * component. A lazy-only route (`about.lazy.tsx` without `about.tsx`, the
 * documented pattern of docs/router/guide/code-splitting.md) has its
 * component in the lazy file: it is prerendered, as on main. A route whose
 * file records no component (an API route) is not.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, onTestFinished, test } from 'vitest'
import { Generator, getConfig } from '@tanstack/router-generator'
import { prerender } from '../src/prerender'
import { parseStartConfig } from '../src/schema'
import { prerenderRoutesPlugin } from '../src/start-router-plugin/generator-plugins/prerender-routes-plugin'

const files: Record<string, string> = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/about.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/about')({ component: () => 'about' })
`,
  'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({ component: () => 'posts' })
`,
  'src/routes/api.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api')({ loader: () => 1 })
`,
}

test('a lazy-only route is discovered for prerendering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tss-prerender-discovery-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  const config = getConfig(
    {
      disableLogging: true,
      routesDirectory: path.join(root, 'src/routes'),
      generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
      tmpDir: path.join(root, '.tanstack/tmp'),
      plugins: [prerenderRoutesPlugin()],
    },
    root,
  )
  await new Generator({ config, root }).run()

  const requested: Array<string> = []
  const outputDir = path.join(root, 'dist/client')
  await prerender({
    startConfig: parseStartConfig(
      { prerender: { enabled: true } },
      { framework: 'react' },
      root,
    ),
    handler: {
      getClientOutputDirectory: () => outputDir,
      async request(pathname) {
        // (`/posts/`: the page's directory)
        requested.push(
          new URL(pathname, 'http://localhost').pathname.replace(
            /(.)\/$/,
            '$1',
          ),
        )
        return new Response('<html><body>page</body></html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    },
  })

  expect(requested).toContain('/about')
  expect(requested).toContain('/posts')
  expect(requested).not.toContain('/api')
})
