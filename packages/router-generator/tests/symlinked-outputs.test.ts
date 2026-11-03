/**
 * Symlinked route files and route trees the generator rewrites, read back
 * from disk after a run: the link is what the user made, and the file it
 * names (shared with other consumers) is what gets the new content.
 */
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { createApp, generate, rootRoute } from './app'

const wrongId = `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/wrong')({})\n`

/** Writes `target` (relative to `root`) and links `link` to it with `linkText`. */
async function linked(
  root: string,
  link: string,
  target: string,
  text: string,
  linkText = path.join(root, target),
) {
  await mkdir(path.dirname(path.join(root, target)), { recursive: true })
  await writeFile(path.join(root, target), text)
  await mkdir(path.dirname(path.join(root, link)), { recursive: true })
  await symlink(linkText, path.join(root, link))
}

async function expectLink(root: string, link: string, linkText: string) {
  const file = path.join(root, link)
  expect((await lstat(file)).isSymbolicLink()).toBe(true)
  expect(await readlink(file)).toBe(linkText)
}

describe('symlinked files the generator rewrites', () => {
  test('route file linked to a file: the link stays and the target gets the upkeep', async () => {
    const root = await createApp({ 'src/routes/__root.tsx': rootRoute() })
    await linked(root, 'src/routes/about.tsx', 'shared/about.tsx', wrongId)
    await generate(root)
    await expectLink(
      root,
      'src/routes/about.tsx',
      path.join(root, 'shared/about.tsx'),
    )
    expect(
      await readFile(path.join(root, 'shared/about.tsx'), 'utf8'),
    ).toContain(`'/about'`)
  })

  test('route file linked relatively through a directory link: both links stay and the file behind them gets the upkeep', async () => {
    const root = await createApp({ 'src/routes/__root.tsx': rootRoute() })
    await mkdir(path.join(root, 'shared'), { recursive: true })
    await symlink(path.join(root, 'shared'), path.join(root, 'via'))
    await linked(
      root,
      'src/routes/about.tsx',
      'shared/about.tsx',
      wrongId,
      '../../via/about.tsx',
    )
    await generate(root)
    await expectLink(root, 'src/routes/about.tsx', '../../via/about.tsx')
    await expectLink(root, 'via', path.join(root, 'shared'))
    expect(
      await readFile(path.join(root, 'shared/about.tsx'), 'utf8'),
    ).toContain(`'/about'`)
  })

  test('route tree linked to a file: the link stays and the target holds the tree', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/')({})\n`,
    })
    await linked(
      root,
      'src/routeTree.gen.ts',
      'shared/routeTree.gen.ts',
      '// old\n',
    )
    await generate(root)
    await expectLink(
      root,
      'src/routeTree.gen.ts',
      path.join(root, 'shared/routeTree.gen.ts'),
    )
    expect(
      await readFile(path.join(root, 'shared/routeTree.gen.ts'), 'utf8'),
    ).toContain('routeTree')
  })

  test('route tree in a linked directory: the directory link stays and the tree lands behind it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/')({})\n`,
    })
    await mkdir(path.join(root, 'shared'), { recursive: true })
    await symlink(path.join(root, 'shared'), path.join(root, 'src/generated'))
    await linked(
      root,
      'src/generated/routeTree.gen.ts',
      'shared/tree.ts',
      '// old\n',
      './tree.ts',
    )
    await generate(root, {
      generatedRouteTree: path.join(root, 'src/generated/routeTree.gen.ts'),
    })
    await expectLink(root, 'src/generated', path.join(root, 'shared'))
    await expectLink(root, 'shared/routeTree.gen.ts', './tree.ts')
    expect(await readFile(path.join(root, 'shared/tree.ts'), 'utf8')).toContain(
      'routeTree',
    )
  })

  test.skipIf(process.platform === 'win32')(
    'the linked file keeps its mode',
    async () => {
      const root = await createApp({ 'src/routes/__root.tsx': rootRoute() })
      await linked(root, 'src/routes/about.tsx', 'shared/about.tsx', wrongId)
      await chmod(path.join(root, 'shared/about.tsx'), 0o640)
      await generate(root)
      await expectLink(
        root,
        'src/routes/about.tsx',
        path.join(root, 'shared/about.tsx'),
      )
      const target = path.join(root, 'shared/about.tsx')
      expect((await stat(target)).mode & 0o777).toBe(0o640)
      expect(await readFile(target, 'utf8')).toContain(`'/about'`)
    },
  )
})
