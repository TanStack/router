/**
 * `vite build --watch` and `rsbuild build --watch` of a Start app: the first
 * build succeeds, and an edit of a module both environments bundle rebuilds
 * them with it; the client's server fn is still served by the rebuilt server
 * (Start's own server entry, inside a real request). A rebuild judges an
 * unchanged module against what the edit changed in the modules it imports.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
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
        watchEdits: {
          'client-entry.ts': `export { greet } from './fns'
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
        watchEdits: clientOnlyEdit,
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
  test.for([
    ['exclude', { exclude: ['**/node_modules/**'] }],
    ['include', { include: ['src/**'] }],
  ] as const)(
    'an app whose build.watch has an %s: a client-only save rebuilds the server',
    async ([, filter]) => {
      const watch = { build: { watch: filter } } satisfies UserConfig
      const build = await buildStart({
        bundler: 'vite',
        files: pageApp,
        entry: pageEntry,
        viteConfig: { environments: { client: watch, ssr: watch } },
        watchEdits: clientOnlyEdit,
      })
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
      await expectLastClientBuild(build)
    },
    timeout,
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
        watchEdits: {
          'src/client-entry.ts': `import './app.css'
export { getRouter } from './router'
export { label } from './client-only'
`,
        },
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
        writeBundle() {
          if (this.environment.name === 'client' && ++clientWrites === 2) {
            released()
          }
        },
      }
      const build = await buildStart({
        bundler: 'vite',
        files: pageApp,
        entry: pageEntry,
        viteConfig: { plugins: [hold] },
        watchEdits: [{ edits: {} }],
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
          { edits: clientOnlyEdit },
        ],
      })
      expect(build.client.where('MARK_EDIT')).not.toBe('nowhere')
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
        watchEdits: { 'client-only.ts': clientOnly(`'MARK_LABEL'`) },
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
