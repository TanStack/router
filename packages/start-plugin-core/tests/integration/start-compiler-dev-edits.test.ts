/**
 * Dev edits of Start factory modules through the public Start host
 * (`../start-host`: `tanstackStart()` on a real Vite dev server, a real
 * Chromium page): the files are written through the dev server's watcher
 * (`StartHost.edit`, watched directories of the app that exist before the
 * server starts, as in an app) and requested again; the dev server
 * invalidates what the edit changed. One host of its own: it writes no case
 * directories (which its watcher ignores, and the edit settle would wait
 * for). Moved from start-compiler-cases.test.ts and
 * start-compiler-factories.test.ts (the fast tier's shared hosts run no
 * edits).
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { factoryEdits } from '../compiler-inputs'
import {
  fromPage,
  settle,
  throwsError,
  useStartHost,
} from '../regression-helpers'
import type { PageSettled, StartHost } from '../regression-helpers'

/** The edited directories of the re-export chain and aliased env-only rows. */
const editDirs = {
  reexportChain: 'src/edits/reexport-chain',
  aliasedEnvOnly: 'src/edits/aliased-env-only',
}
/** `files` in the directory `dir`. */
const inDir = (dir: string, files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).map(([file, code]) => [`${dir}/${file}`, code]),
  )

/**
 * The app's files before the dev server starts: the first two rows' modules,
 * a server route of the app that calls the aliased server fn from server
 * code, and the (empty) directories of the factory rows.
 */
const editFiles = {
  ...inDir(editDirs.reexportChain, factoryEdits.reexportChain.files),
  ...inDir(editDirs.aliasedEnvOnly, factoryEdits.aliasedEnvOnly.files),
  'src/routes/edit-probe.ts': `import { createFileRoute } from '@tanstack/react-router'
import { serverFn } from '../edits/aliased-env-only/module'
export const Route = createFileRoute('/edit-probe')({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json({ value: await serverFn() })
        } catch (error) {
          return Response.json({ thrown: { name: error.name, message: error.message } })
        }
      },
    },
  },
})
`,
  'src/edits/factory/.keep': '',
  'src/edits/export-star/.keep': '',
}

const editHost = useStartHost({ files: editFiles })
beforeAll(async () => {
  await (await editHost()).page()
}, 60_000)

describe('dev edits', () => {
  /**
   * Edits app files through the dev server's watcher (written before the
   * server started, so this is a change of existing files), and evaluates
   * `module.tsx` of `dir` in the SSR environment.
   */
  async function editAndImport(
    started: StartHost,
    dir: string,
    files: Record<string, string>,
  ) {
    await started.edit(inDir(dir, files))
    return started.host.importServer(`/${dir}/module.tsx`, 'ssr')
  }

  // On main, in dev, the importer keeps the old behaviour (here it runs a
  // function that should now be client-only) until it is edited itself or the
  // server restarts.
  // Source: rerouted compiler.test.ts "invalidateModule clears cached module
  // resolution state" (green through the internal compiler, which the test
  // invalidated and recompiled itself); reproduced through a real Vite dev
  // edit. Unbundled client edits of a server fn factory are covered by
  // start-compiler-dev-server.test.ts.
  test('a dev edit of a module a re-export chain ends in recompiles its importers', async () => {
    const started = await editHost()
    const dir = editDirs.reexportChain
    const before = await started.host.importServer(`/${dir}/module.tsx`)
    expect(settle(before.myFn)).toBe('server-only-value')

    const after = await editAndImport(
      started,
      dir,
      factoryEdits.reexportChain.edit,
    )
    expect(settle(after.myFn)).toEqual(throwsError)
  }, 30_000)

  // Control for the pin above (same harness, and the concept of
  // compiler.test.ts "recompiles aliased env-only calls in a provider whose
  // source only mentions createServerFn", rerouted through a real dev edit):
  // a server fn module whose source only mentions createServerFn calls an
  // env-only factory the factory module renames; after the factory module
  // is edited into another kind, the server fn runs the new code.
  test('a dev edit of an aliased env-only factory recompiles the server fn that calls it', async () => {
    const started = await editHost()
    const dir = editDirs.aliasedEnvOnly
    // The server route of the app calls the server fn from server code.
    const callServerFn = async () =>
      fromPage(
        (await (
          await fetch(new URL('/edit-probe', started.host.dev.url))
        ).json()) as PageSettled,
      )

    expect(await callServerFn()).toBe('server-only-value')

    await started.edit(inDir(dir, factoryEdits.aliasedEnvOnly.edit))
    expect(await callServerFn()).toEqual(throwsError)
  }, 30_000)

  /**
   * Imports an app module in the host's page and runs `script` with it as
   * `module` (again, on the new document, when an edit reloaded the page;
   * `fresh`: on a new document). Through the host's page runs, which
   * bound a run and report the page's errors and console when it fails.
   */
  async function inEditPage(
    url: string,
    script: string,
    runOptions?: { fresh?: boolean },
  ) {
    const run = await (
      await editHost()
    ).run(
      `(async () => { const module = await import(${JSON.stringify(url)}); ${script} })()`,
      runOptions,
    )
    return run.result
  }

  // On main, until the dev server restarts, the page calls a server fn that
  // no longer exists (here: Start's RPC fails), or keeps the old client
  // behaviour of an edited factory.
  // Reproduced through a Vite dev server and the public Start plugin; served
  // code read for the diagnosis only.
  test('dev: editing a factory module recompiles its importers against the new code', async () => {
    const started = await editHost()
    const dir = 'src/edits/factory'
    await started.edit({
      [`${dir}/b.ts`]: `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
      [`${dir}/c.ts`]: `export * from './b'`,
      // (`./db`, not `./db.server`: after the edit the handler is user
      // code the client runs, and import protection would deny a `.server`
      // module there.)
      [`${dir}/db.ts`]: `export const db = { x: () => 'x' }\n`,
      [`${dir}/a.tsx`]: `import { base } from './c'
import { db } from './db'
export const fn = base.handler(async () => db.x())`,
    })
    // Before: a server fn (Start's fetcher), calling the server.
    expect(
      await inEditPage(
        `/${dir}/a.tsx`,
        'return { url: typeof module.fn.url, result: await module.fn() }',
      ),
    ).toEqual({ url: 'string', result: 'x' })
    // `base` is no server fn builder anymore: the handler is user code.
    await started.edit({
      [`${dir}/b.ts`]: `export const base = { handler: (fn: unknown) => fn }`,
    })
    expect(
      await inEditPage(
        `/${dir}/a.tsx`,
        `try {
  return { url: typeof module.fn.url, result: await module.fn() }
} catch (error) {
  return { url: typeof module.fn.url, threw: String(error && error.message) }
}`,
        { fresh: true },
      ),
    ).toEqual({ url: 'undefined', result: 'x' })
  }, 30_000)

  test('dev: a server fn imported through an export * of the Start package compiles after an unrelated edit', async () => {
    const started = await editHost()
    const dir = 'src/edits/export-star'
    const code = `import { createServerFn } from './start'
export const fn = createServerFn().handler(async () => 'secret-body')`
    await started.edit({
      [`${dir}/start.ts`]: `export * from '@tanstack/react-start'`,
      [`${dir}/other.ts`]: `export const x = 1`,
      [`${dir}/a.ts`]: code,
    })
    expect(await started.host.transform(`/${dir}/a.ts`)).not.toContain(
      'secret-body',
    )
    await started.edit({ [`${dir}/other.ts`]: `export const x = 2` })
    await started.edit({ [`${dir}/b.ts`]: code })
    expect(await started.host.transform(`/${dir}/b.ts`)).not.toContain(
      'secret-body',
    )
    // The client's server fn reaches its handler through the server.
    expect(await inEditPage(`/${dir}/b.ts`, 'return await module.fn()')).toBe(
      'secret-body',
    )
  }, 30_000)
})
