/**
 * The route generator in `rsbuild build --watch` (SPEC J1.10): a route file
 * created while the build watches is no module of the bundle, so the
 * bundler's watcher does not report it; the generator watches the route
 * roots itself, as in development, and the route tree it writes makes the
 * build compile again with the new route.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { buildStart } from '../build-harness'

const timeout = 60_000

test(
  'rsbuild build --watch: a route file created while the build watches joins the route tree and the rebuild',
  async () => {
    const build = await buildStart({
      bundler: 'rsbuild',
      files: { 'src/entry.ts': `export {}\n` },
      entry: 'src/entry.ts',
      start: { importProtection: { enabled: false } },
      watchEdits: {
        'src/routes/later.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/later')({
  component: () => 'MARK_LATER',
})
`,
      },
    })
    expect(
      await readFile(path.join(build.root, 'src/routeTree.gen.ts'), 'utf8'),
    ).toContain(`'/later'`)
    expect(build.ssr.where('MARK_LATER')).not.toBe('nowhere')
  },
  timeout,
)
