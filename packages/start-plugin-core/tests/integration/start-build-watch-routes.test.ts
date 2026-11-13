/**
 * The route generator in `vite build --watch` and `rsbuild build --watch`
 * (SPEC J1.10): a route file created while the build watches is no module
 * of the bundle, so the bundler's watcher does not report it; the generator
 * watches the route roots itself, as in development, and the route tree it
 * writes makes the build compile again with the new route. On Vite, whether
 * the app's config file gives Start's plugins (one generation per build) or
 * a program passes them inline.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { buildStart } from '../build-harness'

const timeout = 60_000

const later = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/later')({
  component: () => 'MARK_LATER',
})
`

test(
  'rsbuild build --watch: a route file created while the build watches joins the route tree and the rebuild',
  async () => {
    const build = await buildStart({
      bundler: 'rsbuild',
      files: { 'src/entry.ts': `export {}\n` },
      entry: 'src/entry.ts',
      start: { importProtection: { enabled: false } },
      watchEdits: { 'src/routes/later.tsx': later },
    })
    expect(
      await readFile(path.join(build.root, 'src/routeTree.gen.ts'), 'utf8'),
    ).toContain(`'/later'`)
    expect(build.ssr.where('MARK_LATER')).not.toBe('nowhere')
  },
  timeout,
)

// Source: review round 2 F3-1 (Vite's watcher reports the files of the
// bundle only: the created route file never joined the tree, not even at a
// later rebuild)
test.each([
  { plugins: 'the config file', viteConfigFile: true },
  { plugins: 'inline plugins', viteConfigFile: false },
])(
  'round 2 F3-1: vite build --watch with $plugins: a route file created while the build watches joins the route tree and the rebuild',
  async ({ viteConfigFile }) => {
    const build = await buildStart({
      bundler: 'vite',
      viteConfigFile,
      files: { 'src/entry.ts': `export {}\n` },
      entry: 'src/entry.ts',
      start: { importProtection: { enabled: false } },
      watchEdits: { 'src/routes/later.tsx': later },
    })
    expect(
      await readFile(path.join(build.root, 'src/routeTree.gen.ts'), 'utf8'),
    ).toContain(`'/later'`)
    expect(build.client.where('MARK_LATER')).not.toBe('nowhere')
    expect(build.ssr.where('MARK_LATER')).not.toBe('nowhere')
  },
  timeout,
)
