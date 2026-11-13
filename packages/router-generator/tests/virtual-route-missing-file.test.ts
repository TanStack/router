/**
 * A virtual route config (`virtualRouteConfig`, or a `__virtual.ts` subtree)
 * names its route files. A named file that does not exist fails the run
 * naming the file, as on main: the route (a layout, its loader, its
 * `beforeLoad` guard) must never silently drop out of a build, its children
 * re-parented to the root (SPEC J1, R86/R101). A running session reports it
 * and keeps the tree it last published.
 */
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  index,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { Generator } from '../src'
import { configOf, createApp, fileRoute, rootRoute } from './app'

const config = virtualRootRoute('__root.tsx', [
  virtualRoute('/dashboard', 'dashboard.tsx', [
    index('dash-index.tsx'),
    virtualRoute('/settings', 'settings.tsx'),
  ]),
])

test('a cold run whose virtual route config names a missing file fails naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/dash-index.tsx': fileRoute('/dashboard/'),
    'src/routes/settings.tsx': fileRoute('/dashboard/settings'),
  })
  const generator = new Generator({
    config: configOf(root, { virtualRouteConfig: config }),
    root,
  })
  expectDiagnostic(await captureThrow(() => generator.run()), {
    severity: 'error',
    file: 'src/routes/dashboard.tsx',
    root,
  })
})

test('a __virtual.ts subtree naming a missing file fails the run naming the file', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/admin/__virtual.ts': `import { defineVirtualSubtreeConfig, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig([route('/users', 'users.tsx')])
`,
  })
  const generator = new Generator({ config: configOf(root), root })
  expectDiagnostic(await captureThrow(() => generator.run()), {
    severity: 'error',
    file: 'src/routes/admin/users.tsx',
    root,
  })
})

test('in a running session, deleting a file the virtual route config names fails the batch and keeps the tree', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/dashboard.tsx': fileRoute('/dashboard'),
    'src/routes/dash-index.tsx': fileRoute('/dashboard/'),
    'src/routes/settings.tsx': fileRoute('/dashboard/settings'),
  })
  const resolved = configOf(root, { virtualRouteConfig: config })
  const generator = new Generator({ config: resolved, root })
  await generator.run()
  const tree = await readFile(resolved.generatedRouteTree, 'utf8')

  const dashboard = path.join(root, 'src/routes/dashboard.tsx')
  await rm(dashboard)
  expectDiagnostic(
    await captureThrow(() =>
      generator.run({ type: 'delete', path: dashboard }),
    ),
    { severity: 'error', file: 'src/routes/dashboard.tsx', root },
  )
  expect(await readFile(resolved.generatedRouteTree, 'utf8')).toBe(tree)
})
