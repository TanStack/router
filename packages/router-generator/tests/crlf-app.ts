/** Shared real generation workload: semantic acceptance and byte control. */
import fs from 'node:fs/promises'
import path, { join } from 'node:path'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { Generator, getConfig } from '../src'
import { recordDirectoryInputs } from './consumer-inputs'
import { observeRouteTree } from './route-tree'

export const crlfRoutes = {
  '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => null,
})
`,
  'posts.$postId.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts/$postId')({
  loader: () => 'post',
})
`,
}

/** Runs the generator twice on the routes with `newline` line endings. */
export async function generateCrlf(newline: string) {
  const root = await fs.mkdtemp(path.join(runDirectory(), 'tsr-crlf-'))
  try {
    await fs.mkdir(join(root, 'routes'))
    for (const [file, code] of Object.entries(crlfRoutes)) {
      await fs.writeFile(
        join(root, 'routes', file),
        code.replaceAll('\n', newline),
      )
    }
    const config = getConfig({
      disableLogging: true,
      routesDirectory: join(root, 'routes'),
      generatedRouteTree: join(root, 'routeTree.gen.ts'),
      tmpDir: join(root, '.tanstack/tmp'),
    })
    await recordDirectoryInputs(root, config.generatedRouteTree)
    const read = async () => ({
      observed: await observeRouteTree(config.generatedRouteTree),
      treeBytes: await fs.readFile(config.generatedRouteTree, 'utf8'),
      routes: await Promise.all(
        Object.keys(crlfRoutes).map((file) =>
          fs.readFile(join(root, 'routes', file), 'utf8'),
        ),
      ),
    })
    await new Generator({ config, root }).run()
    const first = await read()
    const observed = await observeRouteTree(config.generatedRouteTree)
    await new Generator({ config, root }).run()
    return { first, observed, second: await read() }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}
