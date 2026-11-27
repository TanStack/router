/**
 * What a generator publishes after a run: the registry
 * (`getRoutesByFileMap`), the digests of the files the route tree imports
 * (`sourceDigest`), and what a generator plugin is told
 * (`onRouteTreeChanged`). Each run publishes one generation, after the route
 * files' upkeep is written: a reader sees the registry, the digests and the
 * route files of that one generation, whichever path the run took (a
 * rescan, an edit, a failed batch).
 */
import { readFileSync } from 'node:fs'
import { readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { Generator, contentDigest, replaceBackslash } from '../src'
import { configOf, createApp, fileRoute, linked, rootRoute, save } from './app'
import type { GeneratorPlugin, GetRoutesByFileMapResult } from '../src'

/** A registry as plain data, for comparison. */
function entriesOf(routes: GetRoutesByFileMapResult) {
  return Object.fromEntries(routes)
}

describe('the registry', () => {
  // A route file replaced by a link to the file another route's link names:
  // that file can't hold both routes, so the run makes the replaced file a
  // file of its own again. The registry still listed the shared file under
  // the replaced route (`/a`), as it was computed before that write: the
  // router plugin compiled `/b`'s module with `/a`'s HMR id, and an edit of
  // `/b`'s loader reached the page only after a reload.
  // Source: VERIFY-router V-64a (R2-01), a regression vs main.
  test('a route file replaced by a link to the file of another route lists that file under the other route', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/a.tsx': fileRoute('/a'),
    })
    await linked(
      root,
      'src/routes/b.tsx',
      'src/shared/page.tsx',
      fileRoute('/b'),
    )
    const config = configOf(root)
    const generator = new Generator({ config, root })
    await generator.run()

    const a = path.join(root, 'src/routes/a.tsx')
    await rm(a)
    await symlink(path.join(root, 'src/shared/page.tsx'), a)
    await generator.run({ type: 'update', path: a })

    const shared = replaceBackslash(path.join(root, 'src/shared/page.tsx'))
    expect(generator.getRoutesByFileMap().get(shared)?.routeId).toBe('/b')
    const fresh = new Generator({ config, root })
    await fresh.run()
    expect(entriesOf(generator.getRoutesByFileMap())).toEqual(
      entriesOf(fresh.getRoutesByFileMap()),
    )
  })

  // The registry is a snapshot replaced only when an entry changed: the same
  // object again is the same registry (the router plugin's context skips its
  // listeners for it). A run that scanned the routes again replaced it with
  // an equal one.
  // Source: whole-PR review R2-02.
  test('a run that changes no entry keeps the same registry, and one that adds a route replaces it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/about.tsx': fileRoute('/about'),
    })
    const generator = new Generator({ config: configOf(root), root })
    await generator.run()
    const first = generator.getRoutesByFileMap()

    await generator.run()
    const helper = await save(
      root,
      'src/routes/helper.ts',
      'export const helper = 1\n',
    )
    await generator.run({ type: 'create', path: helper })
    const about = await save(
      root,
      'src/routes/about.tsx',
      fileRoute('/about', '{ loader: () => 1 }'),
    )
    await generator.run({ type: 'update', path: about })
    expect(generator.getRoutesByFileMap()).toBe(first)

    const added = await save(root, 'src/routes/new.tsx', fileRoute('/new'))
    await generator.run({ type: 'create', path: added })
    expect(generator.getRoutesByFileMap()).not.toBe(first)
    expect(generator.getRoutesByFileMap().get(replaceBackslash(added))).toEqual(
      { routeId: '/new', kind: 'file', routerConstructor: true },
    )
  })

  // V-64a under a linked routes directory: the replaced file, made a file of
  // its own, still has a real path (the directory's link resolves), which is
  // the module id a bundler gives it. The registry dropped it.
  // Source: review of the generation record (Astra 1).
  test('a route file made a file of its own under a linked routes directory keeps its real path', async () => {
    const root = await createApp({
      'actual/__root.tsx': rootRoute(),
      'actual/a.tsx': fileRoute('/a'),
      'src/shared/page.tsx': fileRoute('/b'),
    })
    await symlink(path.join(root, 'actual'), path.join(root, 'src/routes'))
    const shared = path.join(root, 'src/shared/page.tsx')
    await symlink(shared, path.join(root, 'actual/b.tsx'))
    const config = configOf(root)
    const generator = new Generator({ config, root })
    await generator.run()

    const a = path.join(root, 'src/routes/a.tsx')
    await rm(a)
    await symlink(shared, a)
    await generator.run({ type: 'update', path: a })

    const real = replaceBackslash(path.join(root, 'actual/a.tsx'))
    expect(generator.getRoutesByFileMap().get(real)?.routeId).toBe('/a')
    expect(generator.sourceDigest(real)).toBe(
      contentDigest(await readFile(real, 'utf8')),
    )
    const fresh = new Generator({ config, root })
    await fresh.run()
    expect(entriesOf(generator.getRoutesByFileMap())).toEqual(
      entriesOf(fresh.getRoutesByFileMap()),
    )
  })

  // An `onWrite` observer that throws fails the run, but the write it was
  // told of is done: the registry and the digests follow the file on disk.
  // The run published the facts from before the write (the shared file
  // under `/a`, the old digest of `a.tsx`).
  // Source: review of the generation record (Astra 2).
  test('a write an onWrite observer throws on is published as written', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/a.tsx': fileRoute('/a'),
    })
    await linked(
      root,
      'src/routes/b.tsx',
      'src/shared/page.tsx',
      fileRoute('/b'),
    )
    const a = path.join(root, 'src/routes/a.tsx')
    let armed = false
    const generator = new Generator({
      config: configOf(root),
      root,
      onWrite: ({ destination }) => {
        if (armed && destination === replaceBackslash(a)) {
          throw new Error('observer failed')
        }
      },
    })
    await generator.run()

    await rm(a)
    await symlink(path.join(root, 'src/shared/page.tsx'), a)
    armed = true
    await expect(generator.run({ type: 'update', path: a })).rejects.toThrow(
      'observer failed',
    )

    const shared = replaceBackslash(path.join(root, 'src/shared/page.tsx'))
    expect(generator.getRoutesByFileMap().get(shared)?.routeId).toBe('/b')
    expect(generator.sourceDigest(replaceBackslash(a))).toBe(
      contentDigest(await readFile(a, 'utf8')),
    )
  })

  // A generator retired during its run (the host replaced it) publishes
  // nothing more: it installed the model of that run beside the tree it
  // did not write.
  // Source: review of the generation record (Gemini).
  test('a generator retired during its run publishes nothing from it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/a.tsx': fileRoute('/wrong'),
    })
    const config = configOf(root)
    const generator: Generator = new Generator({
      config,
      root,
      // (told of the route file's upkeep, written before the tree)
      onWrite: () => generator.retire(),
    })
    await generator.run()
    expect(await readFile(path.join(root, 'src/routes/a.tsx'), 'utf8')).toBe(
      fileRoute('/a'),
    )
    expect(generator.hasGenerated()).toBe(false)
    expect(generator.treeDigest()).toBeUndefined()
    expect(generator.getRoutesByFileMap().size).toBe(0)
  })
})

/**
 * Asserts that `run` fails on the route conflict of `files` (paths relative
 * to the app root), naming each (its wording is free).
 */
async function expectConflict(
  run: Promise<void>,
  root: string,
  files: Array<string>,
) {
  const error = await captureThrow(() => run)
  for (const file of files) {
    expectDiagnostic(error, {
      severity: 'error',
      root,
      file: path.join(root, file),
    })
  }
}

describe('a batch that fails', () => {
  // A second file for route `/b` fails every batch until it goes; the
  // registry keeps the published routes, with what their files say now.
  const conflicting = ['src/routes/b.tsx', 'src/routes/(g)/b.tsx']
  async function failing(files: Record<string, string> = {}) {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/a.tsx': fileRoute('/a'),
      'src/routes/b.tsx': fileRoute('/b'),
      ...files,
    })
    return {
      root,
      /** Publishes the app, then makes every batch fail. */
      async start(generator: Generator) {
        await generator.run()
        const conflict = await save(
          root,
          'src/routes/(g)/b.tsx',
          fileRoute('/(g)/b'),
        )
        await expectConflict(
          generator.run({ type: 'create', path: conflict }),
          root,
          conflicting,
        )
      },
    }
  }

  // Source: VERIFY-router V-64b (R2-01): the registry kept `routerConstructor:
  // true` for a file whose `Route` was gone.
  test('a route file that lost its Route is no route constructor in the registry', async () => {
    const { root, start } = await failing()
    const generator = new Generator({ config: configOf(root), root })
    await start(generator)
    const a = await save(root, 'src/routes/a.tsx', 'export const helper = 1\n')
    await expectConflict(
      generator.run({ type: 'update', path: a }),
      root,
      conflicting,
    )
    expect(generator.getRoutesByFileMap().get(replaceBackslash(a))).toEqual({
      routeId: '/a',
      kind: 'file',
      routerConstructor: false,
    })
  })

  // V-64a while batches fail: `a.tsx` replaced by a link to the file `b.tsx`
  // links to. Its upkeep (a file of its own) waits for a batch that
  // succeeds, so the shared file is still `/b`'s, as its text says; the
  // registry gave it to `/a`, the first link.
  // Source: review of the generation record (Fable F1), head only.
  test('a route file replaced by a link to the file of another route leaves that file to the other route', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/a.tsx': fileRoute('/a'),
      'src/routes/c.tsx': fileRoute('/c'),
    })
    await linked(
      root,
      'src/routes/b.tsx',
      'src/shared/page.tsx',
      fileRoute('/b'),
    )
    const generator = new Generator({ config: configOf(root), root })
    await generator.run()
    const conflict = await save(
      root,
      'src/routes/(g)/c.tsx',
      fileRoute('/(g)/c'),
    )
    const conflictingC = ['src/routes/c.tsx', 'src/routes/(g)/c.tsx']
    await expectConflict(
      generator.run({ type: 'create', path: conflict }),
      root,
      conflictingC,
    )

    const a = path.join(root, 'src/routes/a.tsx')
    await rm(a)
    await symlink(path.join(root, 'src/shared/page.tsx'), a)
    await expectConflict(
      generator.run({ type: 'update', path: a }),
      root,
      conflictingC,
    )

    const shared = replaceBackslash(path.join(root, 'src/shared/page.tsx'))
    expect(generator.getRoutesByFileMap().get(shared)?.routeId).toBe('/b')
  })

  // A route file linked out of the routes directory, pointed at another
  // file while batches fail: the registry listed both files, and the digest
  // of the new one was unknown though the generator had read it.
  // Source: whole-PR review R2-01 (Astra R2 #8, FP-A4).
  test('a link pointed at another file lists the new file only, with its digest', async () => {
    const { root, start } = await failing({
      'src/shared/a.tsx': fileRoute('/ext'),
    })
    const targetA = path.join(root, 'src/shared/a.tsx')
    const targetB = path.join(root, 'src/shared/b.tsx')
    const link = path.join(root, 'src/routes/ext.tsx')
    await symlink(targetA, link)
    const generator = new Generator({ config: configOf(root), root })
    await start(generator)
    // (asked once, as a bundler plugin asks)
    expect(generator.sourceDigest(replaceBackslash(targetA))).toBe(
      contentDigest(fileRoute('/ext')),
    )

    const textB = fileRoute('/ext', '{ loader: () => 1 }')
    await writeFile(targetB, textB)
    await rm(link)
    await symlink(targetB, link)
    await expectConflict(
      generator.run({ type: 'update', path: link }),
      root,
      conflicting,
    )

    const routes = generator.getRoutesByFileMap()
    const entry = { routeId: '/ext', kind: 'file', routerConstructor: true }
    expect(routes.has(replaceBackslash(targetA))).toBe(false)
    expect(routes.get(replaceBackslash(targetB))).toEqual(entry)
    expect(routes.get(replaceBackslash(link))).toEqual(entry)
    expect(generator.sourceDigest(replaceBackslash(targetA))).toBeUndefined()
    expect(generator.sourceDigest(replaceBackslash(targetB))).toBe(
      contentDigest(textB),
    )
  })
})

describe('onRouteTreeChanged', () => {
  // A plugin told of a generation reads the generator: the registry and the
  // route files must be the ones the run leaves. After an edit that changed
  // a route's options, plugins were told before the run wrote the file's
  // upkeep (its route id fixed) and before the registry followed the file
  // (its `Route` now the app's own factory).
  // Source: whole-PR review R2-01 (Fable R2 #1, Astra R2 #9, FP-A5).
  test("a plugin reads the registry and the route files of the generation it's told of", async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/about.tsx': fileRoute('/about'),
    })
    const about = path.join(root, 'src/routes/about.tsx')
    const key = replaceBackslash(about)
    let seen: unknown
    const plugin: GeneratorPlugin = {
      name: 'reader',
      onRouteTreeChanged: ({ generator }) => {
        seen = {
          text: readFileSync(about, 'utf8'),
          entry: generator.getRoutesByFileMap().get(key),
        }
      },
    }
    const generator = new Generator({
      config: configOf(root, { plugins: [plugin] }),
      root,
    })
    await generator.run()
    const left = async () => ({
      text: await readFile(about, 'utf8'),
      entry: generator.getRoutesByFileMap().get(key),
    })

    // an option added, the route id pasted from another file
    await save(
      root,
      'src/routes/about.tsx',
      fileRoute('/wrong', '{ loader: () => 1 }'),
    )
    seen = undefined
    await generator.run({ type: 'update', path: about })
    expect(seen).toEqual(await left())
    expect((await left()).text).toContain("createFileRoute('/about')")

    // `Route` made by the app's own factory
    await save(
      root,
      'src/routes/about.tsx',
      "import { makeRoute } from '../-make'\n\nexport const Route = makeRoute({ loader: () => 1 })\n",
    )
    seen = undefined
    await generator.run({ type: 'update', path: about })
    expect(seen).toEqual(await left())
    expect((await left()).entry?.routerConstructor).toBe(false)
  })
})
