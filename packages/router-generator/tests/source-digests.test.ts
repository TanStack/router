/**
 * What the generator answers about the bytes it has of the files the
 * published route tree imports (`sourceDigest`) and of the tree it published
 * (`treeDigest`), in the form `contentDigest` gives for any text: a bundler
 * plugin compares them with the bytes its compiler was handed (Start's
 * Rsbuild dev reload, SPEC J3.10). And the order of a route's children when
 * a pathless layout owns no URL through its own pathless children.
 */
import { readFile, symlink } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { Generator, contentDigest, replaceBackslash } from '../src'
import {
  configOf,
  createApp,
  fileRoute,
  lazyFileRoute,
  rootRoute,
  save,
} from './app'
import { matchesOf } from './route-tree'

const app = {
  'src/routes/__root.tsx': rootRoute(),
  'src/routes/index.tsx': fileRoute('/'),
  'src/routes/about.tsx': fileRoute('/about'),
}

/** A generator that ran once on a new app of `files`. */
async function generated(files: Record<string, string>) {
  const root = await createApp(files)
  const config = configOf(root)
  const generator = new Generator({ config, root })
  await generator.run()
  const file = (name: string) => replaceBackslash(path.join(root, name))
  return { root, config, generator, file }
}

describe('sourceDigest', () => {
  test("a route file's digest is the digest of its text, and follows an edit the generator is told of", async () => {
    const { root, generator, file } = await generated(app)
    const about = file('src/routes/about.tsx')
    expect(generator.sourceDigest(about)).toBe(
      contentDigest(await readFile(about, 'utf8')),
    )
    const before = generator.sourceDigest(about)
    const edited = fileRoute('/about', '{ component: () => null }')
    await save(root, 'src/routes/about.tsx', edited)
    await generator.run({ type: 'update', path: about })
    expect(generator.sourceDigest(about)).toBe(contentDigest(edited))
    // (other bytes, another digest: a plugin comparing them sees the edit)
    expect(generator.sourceDigest(about)).not.toBe(before)
  })

  test('an empty route file the generator fills in answers the digest of the bytes it wrote', async () => {
    const { root, generator, file } = await generated(app)
    const created = await save(root, 'src/routes/new.tsx', '')
    await generator.run({ type: 'create', path: created })
    const written = await readFile(created, 'utf8')
    expect(written).not.toBe('')
    expect(generator.sourceDigest(file('src/routes/new.tsx'))).toBe(
      contentDigest(written),
    )
  })

  test('a route file behind a link answers under its path and under the real path', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
      'src/shared/about.tsx': fileRoute('/about'),
    })
    const real = path.join(root, 'src/shared/about.tsx')
    const link = path.join(root, 'src/routes/about.tsx')
    await symlink(real, link)
    const generator = new Generator({ config: configOf(root), root })
    await generator.run()
    const digest = contentDigest(await readFile(real, 'utf8'))
    expect(generator.sourceDigest(replaceBackslash(link))).toBe(digest)
    expect(generator.sourceDigest(replaceBackslash(real))).toBe(digest)
  })

  // Source: review of the route-set work (Gemini L3: the real path answered
  // the first scanned file linked to it, which the tree does not import).
  test('a real path two scanned files link to answers the one the route tree imports', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
      'src/shared/target.tsx': fileRoute('/z'),
    })
    const real = path.join(root, 'src/shared/target.tsx')
    // (`__root.lazy.tsx` is scanned before `z.tsx`, and the tree imports no root lazy file)
    await symlink(real, path.join(root, 'src/routes/__root.lazy.tsx'))
    await symlink(real, path.join(root, 'src/routes/z.tsx'))
    const generator = new Generator({ config: configOf(root), root })
    await generator.run()
    const digest = contentDigest(await readFile(real, 'utf8'))
    expect(
      generator.sourceDigest(
        replaceBackslash(path.join(root, 'src/routes/z.tsx')),
      ),
    ).toBe(digest)
    expect(generator.sourceDigest(replaceBackslash(real))).toBe(digest)
  })

  test('a scanned file the route tree does not import, and a file of no route, answer nothing', async () => {
    const { generator, file } = await generated({
      ...app,
      'src/routes/__root.lazy.tsx': lazyFileRoute('__root__'),
      'src/other.ts': 'export {}\n',
    })
    expect(generator.sourceDigest(file('src/routes/about.tsx'))).toBeDefined()
    expect(
      generator.sourceDigest(file('src/routes/__root.lazy.tsx')),
    ).toBeUndefined()
    expect(generator.sourceDigest(file('src/other.ts'))).toBeUndefined()
  })
})

describe('treeDigest', () => {
  test('is undefined before the first generation, then the digest of the route tree file', async () => {
    const root = await createApp(app)
    const config = configOf(root)
    const generator = new Generator({ config, root })
    expect(generator.treeDigest()).toBeUndefined()
    await generator.run()
    expect(generator.treeDigest()).toBe(
      contentDigest(await readFile(config.generatedRouteTree, 'utf8')),
    )
    const before = generator.treeDigest()
    await save(root, 'src/routes/extra.tsx', fileRoute('/extra'))
    await generator.run({
      type: 'create',
      path: path.join(root, 'src/routes/extra.tsx'),
    })
    expect(generator.treeDigest()).toBe(
      contentDigest(await readFile(config.generatedRouteTree, 'utf8')),
    )
    expect(generator.treeDigest()).not.toBe(before)
  })
})

// A pathless layout whose only descendants are pathless layouts without
// children owns no URL, like a childless one: the index route beside it is
// the page at `/`. The order was decided by a layout's own children only,
// so `_a` was declared after the index route and the router matched the
// layouts at `/`.
// Source: design-routeset-v5.1.md item 3 (recursive `ownersLast`).
test('a pathless layout whose children are childless pathless layouts does not take `/` from the index route', async () => {
  const { config } = await generated({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/_a.tsx': fileRoute('/_a'),
    'src/routes/_a._b.tsx': fileRoute('/_a/_b'),
    'src/routes/index.tsx': fileRoute('/'),
  })
  expect(await matchesOf(config.generatedRouteTree, '/')).toEqual([
    '__root__',
    '/',
  ])
})
