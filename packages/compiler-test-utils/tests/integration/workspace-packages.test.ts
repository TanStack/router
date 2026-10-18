/**
 * Control tests of workspace-packages.ts: a test app gets a built workspace
 * package through a link in its `node_modules`, and asking for a package
 * that is no workspace package fails with its name.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import {
  linkWorkspacePackages,
  workspacePackage,
  workspacePackageLinks,
} from '../../src/workspace-packages'

// `@tanstack/history` is built by this project's `test:integration` target
// (package.json `nx.targets`); nothing in this package depends on it.
const name = '@tanstack/history'

test('a workspace package is its directory under packages/, with its build', () => {
  const root = workspacePackage(name)
  expect(path.basename(root)).toBe('history')
  expect(workspacePackageLinks([name])).toEqual({
    [`node_modules/${name}`]: root,
  })
})

test('a name that is no workspace package is refused by name', () => {
  expect(() => workspacePackage('@tanstack/no-such-package')).toThrow(
    '@tanstack/no-such-package',
  )
})

test('an app resolves a linked workspace package like an installed one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workspace-packages-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await linkWorkspacePackages(root, [name])
  await writeFile(
    path.join(root, 'main.mjs'),
    `import { createMemoryHistory } from '${name}'
export const location = createMemoryHistory({ initialEntries: ['/linked'] }).location.pathname
`,
  )
  const { location } = (await import(
    /* @vite-ignore */ pathToFileURL(path.join(root, 'main.mjs')).href
  )) as { location: string }
  expect(location).toBe('/linked')
})
