/**
 * Symlinked route files and route trees the generator rewrites, read back
 * from disk after a run. A route file's link is what the user made, and the
 * file it names (shared with other consumers) is what gets the new content
 * (SPEC J1.6). A file two route files of the tree link to can't hold both
 * routes: a link whose route its target doesn't hold becomes a file of its
 * own, as on `main`, and the router loads both routes (Astra overall #5).
 * The route tree gets a file of its own, as on `main`: its imports are
 * relative to where it is configured (Astra round 3, B1). `onWrite` is told
 * of each file replaced, and a run settles after all its writes.
 */
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  stat,
  symlink,
} from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { Generator } from '../src'
import {
  configOf,
  createApp,
  fileRoute,
  generate,
  linked,
  rootRoute,
} from './app'
import { withRouteTree } from './route-tree'

const wrongId = `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/wrong')({})\n`

async function expectLink(root: string, link: string, linkText: string) {
  const file = path.join(root, link)
  expect((await lstat(file)).isSymbolicLink()).toBe(true)
  // Windows stores a link's target with its own separators
  expect(path.normalize(await readlink(file))).toBe(path.normalize(linkText))
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

  test('two route files linked to one file: the router loads both routes', async () => {
    const root = await createApp({ 'src/routes/__root.tsx': rootRoute() })
    const shared = fileRoute('/a', `{ component: () => 'shared page' }`)
    await linked(root, 'src/routes/a.tsx', 'shared/page.tsx', shared)
    await symlink(
      path.join(root, 'shared/page.tsx'),
      path.join(root, 'src/routes/b.tsx'),
    )
    await generate(root)
    await expectLink(
      root,
      'src/routes/a.tsx',
      path.join(root, 'shared/page.tsx'),
    )
    expect(await readFile(path.join(root, 'shared/page.tsx'), 'utf8')).toBe(
      shared,
    )
    await withRouteTree(
      path.join(root, 'src/routeTree.gen.ts'),
      async ({ router, renderAt }) => {
        expect(Object.keys(router.routesById).sort()).toEqual([
          '/a',
          '/b',
          '__root__',
        ])
        expect(await renderAt('/a')).toContain('shared page')
        expect(await renderAt('/b')).toContain('shared page')
      },
    )
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

  test('route tree linked to a file in another directory: the tree becomes a file of its own and the router loads it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute(
        '/',
        `{ component: () => 'home page' }`,
      ),
    })
    await linked(
      root,
      'src/routeTree.gen.ts',
      'shared/routeTree.gen.ts',
      '// old\n',
    )
    await generate(root)
    // Its imports are printed from where it is configured: a bundler
    // resolving them from the link's target would not find the routes
    expect(
      (await lstat(path.join(root, 'src/routeTree.gen.ts'))).isSymbolicLink(),
    ).toBe(false)
    expect(
      await readFile(path.join(root, 'shared/routeTree.gen.ts'), 'utf8'),
    ).toBe('// old\n')
    await withRouteTree(
      path.join(root, 'src/routeTree.gen.ts'),
      async ({ router, renderAt }) => {
        expect(Object.keys(router.routesById).sort()).toEqual(['/', '__root__'])
        expect(await renderAt('/')).toContain('home page')
      },
    )
  })

  test('route tree in a linked directory: the directory link stays and the tree lands behind it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/')({})\n`,
    })
    await mkdir(path.join(root, 'shared'), { recursive: true })
    await symlink(path.join(root, 'shared'), path.join(root, 'src/generated'))
    await generate(root, {
      generatedRouteTree: path.join(root, 'src/generated/routeTree.gen.ts'),
    })
    await expectLink(root, 'src/generated', path.join(root, 'shared'))
    expect(
      await readFile(path.join(root, 'shared/routeTree.gen.ts'), 'utf8'),
    ).toContain('routeTree')
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

  // The hosts whose compilation already took its changed files build the
  // reported files again (the router plugin's webpack and Rspack watch mode).
  test('onWrite reports each replaced file as the generator names it and as it replaced it, once replaced', async () => {
    const root = await createApp({ 'src/routes/__root.tsx': rootRoute() })
    await linked(root, 'src/routes/about.tsx', 'shared/about.tsx', wrongId)
    const reported: Array<{ destination: string; file: string; text: string }> =
      []
    const generator = new Generator({
      config: configOf(root),
      root,
      onWrite: ({ destination, file }) => {
        const relative = (absolute: string) =>
          path.relative(root, absolute).split(path.sep).join('/')
        reported.push({
          destination: relative(destination),
          file: relative(file),
          text: readFileSync(file, 'utf8'),
        })
      },
    })
    await generator.run()
    expect(
      reported.map(({ destination, file }) => ({ destination, file })),
    ).toEqual(
      expect.arrayContaining([
        { destination: 'src/routes/about.tsx', file: 'shared/about.tsx' },
        {
          destination: 'src/routeTree.gen.ts',
          file: 'src/routeTree.gen.ts',
        },
      ]),
    )
    expect(reported).toHaveLength(2)
    for (const { file, text } of reported) {
      expect(text).toBe(await readFile(path.join(root, file), 'utf8'))
    }

    // (a run that leaves every file as it is replaces none)
    await generator.run()
    expect(reported).toHaveLength(2)
  })

  // A run settles once its writes have: an observer that throws fails the
  // run, after every route file it kept up got its upkeep.
  test('a throwing onWrite observer fails the run once every write is done', async () => {
    const files: Record<string, string> = {
      'src/routes/__root.tsx': rootRoute(),
    }
    const names = Array.from({ length: 36 }, (_, i) => `item${i}`)
    for (const name of names) {
      files[`src/routes/${name}.tsx`] = wrongId
    }
    const root = await createApp(files)
    let reported = 0
    const generator = new Generator({
      config: configOf(root),
      root,
      onWrite: () => {
        if (++reported === 1) {
          throw new Error('MARK_OBSERVER')
        }
      },
    })
    /** The route files not kept up yet and the files reported, read as the run settles. */
    const settled = () => ({
      notKeptUp: names.filter(
        (name) =>
          !readFileSync(
            path.join(root, `src/routes/${name}.tsx`),
            'utf8',
          ).includes(`'/${name}'`),
      ),
      reported,
    })
    const {
      outcome,
      notKeptUp,
      reported: reportedWhenSettled,
    } = await generator.run().then(
      () => ({ outcome: 'resolved', ...settled() }),
      (error: unknown) => ({ outcome: String(error), ...settled() }),
    )

    expect(outcome).toContain('MARK_OBSERVER')
    expect(notKeptUp).toEqual([])
    expect(reportedWhenSettled).toBe(names.length)
  })
})
