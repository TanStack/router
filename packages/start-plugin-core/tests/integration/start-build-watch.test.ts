/**
 * `vite build --watch` and `rsbuild build --watch` of a Start app: the first
 * build succeeds, and an edit of a module both environments bundle rebuilds
 * them with it; the client's server fn is still served by the rebuilt server
 * (Start's own server entry, inside a real request). A rebuild judges an
 * unchanged module against what the edit changed in the modules it imports.
 */
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { rejection, reportedViolations } from '../importProtection/start-apps'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'
import type { Plugin, UserConfig } from 'vite'

const timeout = 60_000

const files = {
  'greeting.ts': `export const greeting = 'MARK_BEFORE'
`,
  'fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { greeting } from './greeting'
export const greet = createServerFn().handler(async () => greeting)
`,
  'client-entry.ts': `export { greet } from './fns'
export { greeting } from './greeting'
`,
  'ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
}

describe.each(startBundlers)('%s build --watch', (bundler) => {
  test(
    'the first build succeeds and an edit rebuilds both environments',
    async () => {
      const { client, ssr, firstBuild } = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'greeting.ts': `export const greeting = 'MARK_AFTER'
`,
        },
      })
      expect(firstBuild.filter(({ severity }) => severity === 'error')).toEqual(
        [],
      )
      expect((await client.run(`return entry.greeting`)).result).toBe(
        'MARK_AFTER',
      )
      const url = (await client.run(`return entry.greet.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_AFTER')
    },
    timeout,
  )

  test(
    'a server fn module an edit deletes leaves the rebuilt server',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...files,
          'old.ts': `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(async () => 'MARK_OLD')
`,
          'client-entry.ts': `export { greet } from './fns'
export { old } from './old'
`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'old.ts': null,
          'client-entry.ts': `export { greet } from './fns'
`,
        },
      })
      expect(ssr.where('MARK_OLD')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'a server fn a module of both environments stops importing is refused over HTTP by the rebuilt server',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...files,
          'old.ts': `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(async () => 'MARK_OLD')
`,
          'shared.ts': `export { greet } from './fns'
export { old } from './old'
`,
          'client-entry.ts': `export * from './shared'
`,
          'ssr-entry.ts': `export * from './shared'
export { old } from './old'
${callByIdExports}`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'shared.ts': `export { greet } from './fns'
`,
        },
      })
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
return {
  overHttp: await settle(() => callById(serverFnId(entry.old))),
  fromSsr: await settle(() => entry.old()),
}`)
      // (from SSR code it still works: the server fn is in the resolver)
      expect(result).toEqual({ overHttp: 'rejected', fromSsr: 'MARK_OLD' })
    },
    timeout,
  )

  test(
    'a server fn the client stops importing is refused over HTTP by the rebuilt server',
    async () => {
      const ssrEntry = `export { greet } from './fns'
export { old } from './old'
${callByIdExports}`
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...files,
          'old.ts': `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(async () => 'MARK_OLD')
`,
          'client-entry.ts': `export { greet } from './fns'
export { old } from './old'
`,
          'ssr-entry.ts': ssrEntry,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        // (the server is rebuilt by the client's build: Vite settles on it)
        watchEdits: [
          {
            edits: {
              'client-entry.ts': `export { greet } from './fns'
`,
            },
            rebuilds: ['ssr'],
          },
        ],
      })
      const { result } =
        await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
return {
  overHttp: await settle(() => callById(serverFnId(entry.old))),
  fromSsr: await settle(() => entry.old()),
}`)
      // (from SSR code it still works: the server fn is in the resolver)
      expect(result).toEqual({ overHttp: 'rejected', fromSsr: 'MARK_OLD' })
    },
    timeout,
  )

  test(
    'an allowed import writes its client, and an edit keeps it working',
    async () => {
      const denied = (mark: string) => `export const secret = () => '${mark}'\n`
      const { client, firstBuild } = await buildStart({
        bundler,
        files: {
          'src/lib.server.ts': denied('MARK_BEFORE'),
          'src/entry.ts': `import { secret } from './lib.server'
export const read = () => secret()
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { allowImport: () => true } },
        watchEdits: { 'src/lib.server.ts': denied('MARK_AFTER') },
      })
      expect(firstBuild.filter(({ severity }) => severity === 'error')).toEqual(
        [],
      )
      expect((await client.run(`return entry.read()`)).result).toBe(
        'MARK_AFTER',
      )
    },
    timeout,
  )

  test(
    'a module an edit marks server-only is a violation of its unchanged client importer',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/lib.ts': `export const secret = () => 'MARK_SECRET'
`,
            'src/other.ts': `import { secret } from './lib'
export const read = () => secret()
`,
            'src/entry.ts': `export { read } from './other'
`,
          },
          entry: 'src/entry.ts',
          watchEdits: {
            'src/lib.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
          },
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )

  // Source: Fable 5.2 review (F6-4: the Vite hosts declared no plan
  // dependency outside the module graph to the watcher, so the client kept
  // the mock of a file that is no longer denied).
  test(
    'a module an edit stops marking server-only replaces its mock in the unchanged client',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          'src/lib.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_LIB'
`,
          'src/entry.ts': `import { secret } from './lib'
export const read = () => secret()
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock' } },
        watchEdits: {
          'src/lib.ts': `export const secret = () => 'MARK_LIB'
`,
        },
      })
      expect((await client.run(`return entry.read()`)).result).toBe('MARK_LIB')
    },
    timeout,
  )

  test(
    'a rebuild after a failed one shows the fix',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: [
          { edits: { 'greeting.ts': `export const greeting = \n` } },
          {
            edits: {
              'greeting.ts': `export const greeting = 'MARK_AFTER'
`,
            },
          },
        ],
      })
      expect((await client.run(`return entry.greeting`)).result).toBe(
        'MARK_AFTER',
      )
      const url = (await client.run(`return entry.greet.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_AFTER')
    },
    timeout,
  )

  // Source: review round 3 (R3-G5-4: the Rsbuild host reported the
  // allocator's error once per watch session).
  test(
    'an invalid custom server fn id fails the rebuild too',
    async () => {
      const result = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => 'a/b' } },
        watchEdits: {
          'greeting.ts': `export const greeting = 'MARK_AFTER'
`,
        },
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(result, 'the rebuild fails').toBeInstanceOf(Error)
    },
    timeout,
  )

  // Source: review round 3 (R3-G4-1): the server's rebuild embedded the
  // manifest of the previous client build, so its documents named client
  // files the rebuild no longer emits.
  test(
    'the rebuilt server renders documents that load the rebuilt client files',
    async () => {
      const index = (
        marker: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>${marker}</p> })
`
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...startPageEntries,
          ...pageEntries,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': index('MARK_BEFORE'),
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        watchEdits: { 'src/routes/index.tsx': index('MARK_AFTER') },
      })
      expect(client.where('MARK_AFTER')).not.toBe('nowhere')
      const { result: html } = await ssr.run(
        `return await (await entry.startServerEntry.fetch(new Request('http://localhost/'))).text()`,
      )
      const named = [
        ...(html as string).matchAll(/["']\/([^"'\s]+?\.js)["']/g),
      ].map((m) => m[1]!)
      const emitted = new Set(client.chunks.map((c) => c.fileName))
      expect(named.length).toBeGreaterThan(0)
      expect(named.filter((file) => !emitted.has(file))).toEqual([])
    },
    timeout,
  )
})

// What Start's watch builds rely on of Rolldown's watch mode, which its
// documentation does not promise. Each goes red when Rolldown changes it.
describe('vite build --watch: tripwires', () => {
  // Rolldown's watch rebuild is a whole build: every module's `load` and
  // `transform` run again. Start and the router take a watch build's stale
  // set at its start (and Start embeds the client build afresh in each
  // server build) on that ground. With incremental rebuilds, a module stale
  // only through a dependency would keep its old output.
  test(
    'a rebuild transforms every module of the first build again',
    async () => {
      /** Per environment, the app modules each build transformed. */
      const builds: Record<string, Array<Set<string>>> = { client: [], ssr: [] }
      const record: Plugin = {
        name: 'test:transforms',
        buildStart() {
          builds[this.environment.name]?.push(new Set())
        },
        transform(_code, id) {
          if (!id.includes('/node_modules/')) {
            builds[this.environment.name]?.at(-1)?.add(id)
          }
          return null
        },
      }
      await buildStart({
        bundler: 'vite',
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        viteConfig: { plugins: [record] },
        watchEdits: { 'greeting.ts': `export const greeting = 'MARK_AFTER'\n` },
      })
      for (const env of ['client', 'ssr']) {
        const [first, ...rebuilds] = builds[env]!
        expect(first!.size).toBeGreaterThan(0)
        expect(rebuilds.length).toBeGreaterThan(0)
        for (const rebuild of rebuilds) {
          expect([...first!].filter((id) => !rebuild.has(id))).toEqual([])
        }
      }
    },
    timeout,
  )

  // A client build that fails in `generateBundle` (an import-protection
  // error fails it there) ends with its watcher's ERROR: the server's
  // modules that embed the client build wait for the client's build running
  // now (`Session.clientBuilding`, its watcher's BUNDLE_START to BUNDLE_END
  // or ERROR), so a failure that ended no build would hang the server's.
  test(
    'a client build that fails in generateBundle ends its wait: the next save rebuilds both',
    async () => {
      let failed = false
      let serverEnds = 0
      let serverRebuilt!: () => void
      const rebuilt = new Promise<void>((resolve) => (serverRebuilt = resolve))
      /** Fails the client's first build of the first save, in `generateBundle`. */
      const fail: Plugin = {
        name: 'test:fail-generate-bundle',
        generateBundle(_options, bundle) {
          if (
            this.environment.name === 'client' &&
            !failed &&
            Object.values(bundle).some(
              (chunk) =>
                chunk.type === 'chunk' && chunk.code.includes('MARK_ONE'),
            )
          ) {
            failed = true
            throw new Error('generateBundle failed')
          }
        },
        buildEnd() {
          if (this.environment.name === 'ssr' && ++serverEnds === 2) {
            serverRebuilt()
          }
        },
      }
      const { client, ssr } = await buildStart({
        bundler: 'vite',
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        viteConfig: { plugins: [fail] },
        watchEdits: [
          { edits: { 'greeting.ts': `export const greeting = 'MARK_ONE'\n` } },
          {
            edits: { 'greeting.ts': `export const greeting = 'MARK_TWO'\n` },
            // the server's rebuild of the first save ends (it waited for
            // the failed client build)
            when: () =>
              Promise.race([
                rebuilt,
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error('the server build never ended')),
                    10_000,
                  ),
                ),
              ]),
          },
        ],
      })
      expect(failed).toBe(true)
      expect((await client.run(`return entry.greeting`)).result).toBe(
        'MARK_TWO',
      )
      const url = (await client.run(`return entry.greet.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_TWO')
    },
    timeout,
  )

  // A plugin context kept from an environment's finished build still
  // resolves: a file event's invalidation asks a plan's resolutions with its
  // environment's resolver of its last build (`Session.resolvers`).
  test(
    "a plugin context's resolve still answers after its build ended",
    async () => {
      let resolve:
        | ((source: string, importer: string) => Promise<{ id: string } | null>)
        | undefined
      let answer: string | null | undefined
      const keep: Plugin = {
        name: 'test:kept-resolver',
        buildStart() {
          if (this.environment.name === 'ssr' && !resolve) {
            resolve = (source, importer) => this.resolve(source, importer)
          }
        },
        async watchChange(id) {
          if (this.environment.name === 'ssr' && id.endsWith('greeting.ts')) {
            const importer = id.replace(/greeting\.ts$/, 'fns.ts')
            answer = (await resolve!('./greeting', importer))?.id ?? null
          }
        },
      }
      const build = await buildStart({
        bundler: 'vite',
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        viteConfig: { plugins: [keep] },
        watchEdits: { 'greeting.ts': `export const greeting = 'MARK_AFTER'\n` },
      })
      expect(answer).toBe(path.join(build.root, 'greeting.ts'))
    },
    timeout,
  )
})

describe('vite build --watch: the client build the server embeds', () => {
  const index = (
    marker: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>${marker}</p> })
`
  const serverEntry = startPageEntries['harness/server-entry.ts']

  const pageApp = {
    ...startPageEntries,
    ...pageEntries,
    'src/router.ts': routerFile,
    'src/routes/__root.tsx': rootDocument(),
    'src/routes/index.tsx': index('MARK_BEFORE'),
    'src/client-entry.ts': `export { getRouter } from './router'
export { label } from './client-only'
`,
    'src/client-only.ts': `export const label = 'MARK_BEFORE'\n`,
  }
  const pageEntry = { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' }
  const clientOnlyEdit = {
    'src/client-only.ts': `export const label = 'MARK_EDIT'\n`,
  }
  /** The client-only save, settled once the server was rebuilt after the client's build of it. */
  const clientOnlySave = [{ edits: clientOnlyEdit, rebuilds: ['ssr'] }]
  /** The files of `dir` (relative, `/`-separated), at any depth. */
  const filesOf = (dir: string): Array<string> =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? filesOf(path.join(dir, e.name)).map((f) => `${e.name}/${f}`)
            : [e.name],
        )
      : []
  /** The document the rebuilt server renders, and the client files it names. */
  async function documentOf(build: Awaited<ReturnType<typeof buildStart>>) {
    const { result } = await build.ssr.run(
      `return await (await entry.startServerEntry.fetch(new Request('http://localhost/'))).text()`,
    )
    const html = result as string
    const named = [
      ...new Set(
        [...html.matchAll(/["']\/([^"'\s]+?\.(?:js|css))["']/g)].map(
          (m) => m[1]!,
        ),
      ),
    ]
    return { html, named }
  }
  /** The document names the files of the client's last build, and only those. */
  async function expectLastClientBuild(
    build: Awaited<ReturnType<typeof buildStart>>,
  ) {
    const { named } = await documentOf(build)
    const emitted = new Set(build.client.chunks.map((c) => c.fileName))
    const js = named.filter((file) => file.endsWith('.js'))
    expect(js.length).toBeGreaterThan(0)
    expect(js.filter((file) => !emitted.has(file))).toEqual([])
  }

  // A save of a module only the client bundles: the client's build moves
  // its files, and the server's rebuild embeds them.
  // Source: design 3 step 7 (the server follows the client's build through
  // a file it watches: Rolldown reports a file a `load` added).
  test(
    'a client-only save rebuilds the server, whose document names the files of the last client build',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: pageApp,
        entry: pageEntry,
        watchEdits: clientOnlySave,
      })
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
      await expectLastClientBuild(build)
    },
    timeout,
  )

  // The app limits what its watchers watch (`exclude` is the example of
  // Rollup's watch documentation; `include` names the app's sources).
  // Source: design 3 step 5 review, finding 1 (the server followed the
  // client through a file under `node_modules/.vite`, which the filter
  // hid: the document named files the client had deleted).
  test.for<[string, { include?: Array<string>; exclude?: Array<string> }]>([
    ['exclude', { exclude: ['**/node_modules/**'] }],
    ['include', { include: ['src/**'] }],
  ])(
    'an app whose build.watch has an %s: a client-only save rebuilds the server',
    { timeout },
    async ([, filter]) => {
      const watch: UserConfig = { build: { watch: filter } }
      const build = await buildStart({
        bundler: 'vite',
        files: pageApp,
        entry: pageEntry,
        viteConfig: { environments: { client: watch, ssr: watch } },
        watchEdits: clientOnlySave,
      })
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
      await expectLastClientBuild(build)
    },
  )

  // File names without hashes: a client-only save that adds a stylesheet
  // to the entry leaves every file name as it was.
  // Source: design 3 step 5 review, finding 2 (the digest of the client
  // build serialised the manifest's maps as `{}`: the server was not
  // rebuilt and the document linked no stylesheet).
  test(
    'unhashed file names: a client-only save that adds a stylesheet rebuilds the server, whose document links it',
    async () => {
      const names = {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      }
      const build = await buildStart({
        bundler: 'vite',
        files: { ...pageApp, 'src/app.css': `.probe { color: red; }\n` },
        entry: pageEntry,
        viteConfig: {
          environments: {
            client: { build: { rolldownOptions: { output: names } } },
          },
        },
        watchEdits: [
          {
            edits: {
              'src/client-entry.ts': `import './app.css'
export { getRouter } from './router'
export { label } from './client-only'
`,
            },
            rebuilds: ['ssr'],
          },
        ],
      })
      const css = filesOf(build.client.outDir).filter((f) => f.endsWith('.css'))
      expect(css.length).toBeGreaterThan(0)
      const { named } = await documentOf(build)
      expect(css.filter((file) => !named.includes(file))).toEqual([])
    },
    timeout,
  )

  // A client-only save while the server's first build runs (held at its
  // end until the client rebuilt with the save): the client's build is
  // the second one when the server's first build ends.
  // Source: design 3 step 5 review, finding 3 (Rolldown watches a build's
  // files once it ended: the sentinel written before was never reported;
  // also before step 5).
  test(
    "a client-only save during the server's first build: the server is rebuilt with the last client build",
    async () => {
      let serverEnds = 0
      let clientWrites = 0
      let released!: () => void
      const clientRebuilt = new Promise<void>((resolve) => (released = resolve))
      const hold: Plugin = {
        name: 'test:hold-first-server-build',
        async buildEnd() {
          if (this.environment.name === 'ssr' && serverEnds++ === 0) {
            const root = this.environment.config.root
            const { writeFile } = await import('node:fs/promises')
            await writeFile(
              path.join(root, 'src/client-only.ts'),
              clientOnlyEdit['src/client-only.ts'],
            )
            // (a guard: the hold ends without the client's rebuild too)
            const timer = setTimeout(released, 10_000)
            await clientRebuilt
            clearTimeout(timer)
          }
        },
        buildStart() {
          if (this.environment.name === 'ssr' && clientWrites >= 2) {
            serverRebuilding = true
          }
        },
        writeBundle() {
          if (this.environment.name === 'client' && ++clientWrites === 2) {
            released()
          }
          if (this.environment.name === 'ssr' && serverRebuilding) {
            serverRebuilt()
          }
        },
      }
      // the outcome: a server build begun after the client's rebuild ends
      let serverRebuilding = false
      let serverRebuilt!: () => void
      const rebuilt = new Promise<void>((resolve) => (serverRebuilt = resolve))
      const build = await buildStart({
        bundler: 'vite',
        files: pageApp,
        entry: pageEntry,
        viteConfig: { plugins: [hold] },
        watchEdits: [
          {
            edits: {},
            when: () =>
              Promise.race([
                rebuilt,
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error('the server was not rebuilt')),
                    15_000,
                  ),
                ),
              ]),
          },
        ],
      })
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
      await expectLastClientBuild(build)
    },
    timeout,
  )

  // The app's cache directory (`node_modules/.vite`) is removed while the
  // watch runs, then a module only the client bundles is saved.
  // Source: design 3 step 5 review, finding 4 (the client's build wrote a
  // file in that directory and failed with ENOENT, every build after).
  test(
    'the cache directory removed during the watch: a client-only save still rebuilds both',
    async () => {
      let cacheDir = ''
      const grab: Plugin = {
        name: 'test:cache-dir',
        configResolved(config) {
          cacheDir = config.cacheDir
        },
      }
      const build = await buildStart({
        bundler: 'vite',
        files: pageApp,
        entry: pageEntry,
        viteConfig: { plugins: [grab] },
        watchEdits: [
          {
            // (the builds the removal causes settle first)
            edits: {},
            when: () => {
              rmSync(cacheDir, { recursive: true, force: true })
              return Promise.resolve()
            },
          },
          { edits: clientOnlyEdit, rebuilds: ['ssr'] },
        ],
      })
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
      await expectLastClientBuild(build)
    },
    timeout,
  )

  /** Runs `build` with the system's temporary directory at `dir` (`TMPDIR`, as `os.tmpdir()` reads it). */
  async function withTemporaryDirectory<T>(
    dir: string,
    build: () => Promise<T>,
  ): Promise<T> {
    const before = process.env.TMPDIR
    process.env.TMPDIR = dir
    try {
      return await build()
    } finally {
      if (before === undefined) {
        delete process.env.TMPDIR
      } else {
        process.env.TMPDIR = before
      }
    }
  }

  // What a watch build keeps in the system's temporary directory, which
  // other users of the machine share (Linux's `/tmp`).
  // Source: design 3 final review, finding 1 (a directory at a name derived
  // from the app's path, made with the default mode: another user could
  // create it first and plant a link that the build wrote through; it was
  // never removed).
  test(
    'a watch build keeps its temporary files in a directory only the user can open, removed when its watchers close',
    async () => {
      const temporary = mkdtempSync(path.join(runDirectory(), 'tmpdir-'))
      /** The entries the build made in the temporary directory, with their modes, while it watches. */
      let during: Array<{ name: string; dir: boolean; mode: number }> = []
      await withTemporaryDirectory(temporary, () =>
        buildStart({
          bundler: 'vite',
          files: pageApp,
          entry: pageEntry,
          watchEdits: [
            {
              edits: clientOnlyEdit,
              rebuilds: ['ssr'],
              when: () => {
                during = readdirSync(temporary).map((name) => {
                  const stat = lstatSync(path.join(temporary, name))
                  return {
                    name,
                    dir: stat.isDirectory(),
                    mode: stat.mode & 0o777,
                  }
                })
                return Promise.resolve()
              },
            },
          ],
        }),
      )
      expect(during.length).toBeGreaterThan(0)
      for (const entry of during) {
        expect(entry).toEqual({ name: entry.name, dir: true, mode: 0o700 })
      }
      expect(readdirSync(temporary)).toEqual([])
    },
    timeout,
  )

  // A sandbox whose temporary directory does not exist (or isn't usable):
  // the build goes on, as without a watch.
  // Source: design 3 final review, finding 1 (resolving the missing
  // directory threw in a server module's `load`: the server's build failed).
  test(
    'a temporary directory that does not exist: the watch build succeeds and a save rebuilds both environments',
    async () => {
      const missing = path.join(runDirectory(), 'no-such-tmpdir')
      const build = await withTemporaryDirectory(missing, () =>
        buildStart({
          bundler: 'vite',
          files: pageApp,
          entry: pageEntry,
          watchEdits: { 'src/routes/index.tsx': index('MARK_EDIT') },
        }),
      )
      expect(
        build.firstBuild.filter(({ severity }) => severity === 'error'),
      ).toEqual([])
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
      const { html } = await documentOf(build)
      expect(html).toContain('MARK_EDIT')
      await expectLastClientBuild(build)
    },
    timeout,
  )

  // An edit of the route and of the server entry, which no longer parses:
  // the server's build fails at once, the client builds the route. The fix
  // (the entry, and the route again) is saved while the client still builds
  // the first edit: the server's watcher, idle after its failure, reports
  // it at once, the client's after its build. The server's rebuild must not
  // keep a client build older than the client's last one.
  // Source: Fable 5.2 review (F6-2: the server waited for "the client build
  // that is running", not the one the event causes).
  test(
    'a fix saved while the client builds the edit that broke the server: the document names the files of the last client build',
    async () => {
      let reachedHold!: () => void
      const holding = new Promise<void>((resolve) => (reachedHold = resolve))
      let releaseHold!: () => void
      const hold = new Promise<void>((resolve) => (releaseHold = resolve))
      let serverFailed!: () => void
      const serverFailedOnce = new Promise<void>(
        (resolve) => (serverFailed = resolve),
      )
      let fixWritten = false
      /** Holds the client's build of the first edit until the server's build of the fix began. */
      const holdClient: Plugin = {
        name: 'test:hold-client-build',
        transform(code, id) {
          if (
            this.environment.name === 'client' &&
            id.includes('/routes/index.tsx') &&
            code.includes('MARK_ONE')
          ) {
            reachedHold()
            // (a guard: the hold ends without the server's build too)
            const timer = setTimeout(releaseHold, 10_000)
            return hold.then(() => {
              clearTimeout(timer)
              return null
            })
          }
          return null
        },
        buildStart() {
          if (this.environment.name === 'ssr' && fixWritten) {
            releaseHold()
          }
        },
        buildEnd(error) {
          if (this.environment.name === 'ssr' && error) {
            serverFailed()
          }
        },
      }
      const { client, ssr } = await buildStart({
        bundler: 'vite',
        files: {
          ...startPageEntries,
          ...pageEntries,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': index('MARK_BEFORE'),
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        viteConfig: { plugins: [holdClient] },
        watchEdits: [
          {
            edits: {
              'src/routes/index.tsx': index('MARK_ONE'),
              'harness/server-entry.ts': `${serverEntry}export const = ;\n`,
            },
          },
          {
            edits: {
              'src/routes/index.tsx': index('MARK_TWO'),
              'harness/server-entry.ts': serverEntry,
            },
            when: async () => {
              await Promise.all([holding, serverFailedOnce])
              fixWritten = true
            },
          },
        ],
      })
      expect(client.where('MARK_TWO')).not.toBe('nowhere')
      const { result: html } = await ssr.run(
        `return await (await entry.startServerEntry.fetch(new Request('http://localhost/'))).text()`,
      )
      expect(html).toContain('MARK_TWO')
      const named = [
        ...(html as string).matchAll(/["']\/([^"'\s]+?\.js)["']/g),
      ].map((m) => m[1]!)
      const emitted = new Set(client.chunks.map((c) => c.fileName))
      expect(named.length).toBeGreaterThan(0)
      expect(named.filter((file) => !emitted.has(file))).toEqual([])
    },
    timeout,
  )

  // The client's first build fails (a module only the client bundles does
  // not parse); the server builds meanwhile, with no client build to embed.
  // The fix reaches only the client's watcher; the client's first build
  // rebuilds the server, which then answers the client's calls.
  // Source: design 3 step 4 review, step 5 item 6 (the server built after
  // a failed client build raised the build-order error, J4.2, and was not
  // built again).
  test(
    'a client whose first build fails: its first build rebuilds the server, which answers its calls',
    async () => {
      const clientOnly = (text: string) => `export const label = ${text}\n`
      const { client, ssr, firstBuild } = await buildStart({
        bundler: 'vite',
        files: {
          ...files,
          'client-only.ts': clientOnly(''),
          'client-entry.ts': `export { greet } from './fns'
export { label } from './client-only'
`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: [
          {
            edits: { 'client-only.ts': clientOnly(`'MARK_LABEL'`) },
            rebuilds: ['ssr'],
          },
        ],
      })
      expect(
        firstBuild.some(({ text }) => text.includes('built before the client')),
      ).toBe(false)
      expect((await client.run(`return entry.label`)).result).toBe('MARK_LABEL')
      const url = (await client.run(`return entry.greet.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_BEFORE')
    },
    timeout,
  )
})
