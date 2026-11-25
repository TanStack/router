/**
 * `vite build --watch` of a Start app whose client rebuild fails: what the
 * server embeds of the client build follows the client output on disk. Each
 * row reads the document Start's server entry renders through the failure,
 * fetches the client files it names (their bytes on disk, as a static host
 * serves them) and calls a server fn the client calls; then the app is fixed
 * and the next builds publish the new pair. Plus a fixed custom server fn id
 * whose provider moves, and S4-02's hand-ordered builds.
 *
 * Settlement design, step 0 (design-settlement.md rev 4, §2 "Vite
 * client-build record", §6). The `.fails` tests are pins: step 7 (the record
 * withdrawn at `renderStart`, committed at `writeBundle`, the sentinel at
 * `closeBundle` when nothing was committed) turns them green.
 */
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { describe, expect, test } from 'vitest'
import { buildStart, callByIdPrelude, inAppRequest } from '../build-harness'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'
import type { Plugin } from 'vite'
import type { WatchStep } from '../build-harness'

const timeout = 90_000

const fns = (
  marker: string,
) => `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => '${marker}')
`
const clientOnly = (marker: string) => `export const label = '${marker}'\n`

/** A page app whose client entry exposes `label` (a module only the client bundles) and calls `greet`. */
const app = {
  ...startPageEntries,
  ...pageEntries,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })
`,
  'src/client-entry.ts': `export { getRouter } from './router'
export { label } from './client-only'
export { greet } from './fns'
`,
  'src/client-only.ts': clientOnly('MARK_FIRST'),
  'src/fns.ts': fns('MARK_GREET'),
}
const entry = { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' }
/**
 * A save of the client entry that stops calling `greet` and imports a file
 * that does not exist: the client's build fails in its build phase.
 */
const unresolvedImport = {
  'src/client-entry.ts': `export { getRouter } from './router'
import './not-yet-created'
`,
}
/** The JavaScript files a document names whose bytes are on disk, and those missing. */
const scripts = (served: Served) => {
  const js = Object.keys(served.named).filter((file) => file.endsWith('.js'))
  return {
    count: js.length,
    missing: js.filter((file) => served.named[file] === null),
  }
}
/** Start's options: `greet` has a fixed id, so a call names it across builds. */
const start = {
  serverFns: {
    generateFunctionId: ({ functionName }: { functionName: string }) =>
      functionName.startsWith('greet') ? 'greet_fixed' : undefined,
  },
}

/** An SSR script: what a client call of `greet` (by its id) answers, or the error's message. */
const callGreet = `${callByIdPrelude}try {
  return await callById('greet_fixed')
} catch (error) {
  return String(error?.message ?? error)
}`

/** What the client builds and the server, as the app's host serves them, give at one moment. */
interface Served {
  /** The client files the server's document names, with their bytes on disk (null: none there). */
  named: Record<string, string | null>
  /** What a client call of `greet` (by its id) answers, or the error's message. */
  call: string
}

/**
 * The builds of a watch mode run, seen from outside: where each environment
 * writes, and which environments are building. Also a plugin of the app
 * that fails the client's `generateBundle` or `writeBundle` while `fail`
 * names it (another plugin, placed after Start's).
 */
function watchedBuilds() {
  const state = {
    clientDir: '',
    serverEntry: '',
    /** Client builds whose build phase ended (`buildEnd`; a watch rebuild that fails after it calls `closeBundle` only when its watcher closes). */
    clientBuilt: 0,
    fail: null as null | 'generateBundle' | 'writeBundle',
  }
  const plugin: Plugin = {
    name: 'test:watched-builds',
    buildEnd() {
      if (this.environment.name === 'client') {
        state.clientBuilt++
      }
    },
    generateBundle() {
      if (
        this.environment.name === 'client' &&
        state.fail === 'generateBundle'
      ) {
        throw new Error('test: generateBundle fails')
      }
    },
    writeBundle(options, bundle) {
      if (this.environment.name === 'client') {
        state.clientDir = options.dir!
        if (state.fail === 'writeBundle') {
          throw new Error('test: writeBundle fails')
        }
        return
      }
      const entries = Object.values(bundle).filter(
        (output) =>
          output.type === 'chunk' &&
          output.isEntry &&
          output.facadeModuleId?.endsWith('harness/server-entry.ts'),
      )
      if (entries.length === 1) {
        state.serverEntry = path.join(options.dir!, entries[0]!.fileName)
      }
    },
  }
  /** The document's client files and their bytes, and the call's answer. */
  const served = async (): Promise<Served> => {
    const { stdout } = await runNodeProgram(
      `const result = await (async () => {
${inAppRequest(
  state.serverEntry,
  `const entry = globalThis.__tssBuildHarnessEntry
const html = await (await entry.startServerEntry.fetch(new Request('http://localhost/'))).text()
const call = await (async () => {
${callGreet}
})()
return { html, call }`,
)}
})()
process.stdout.write(JSON.stringify(result))`,
    )
    const { html, call } = JSON.parse(stdout) as { html: string; call: string }
    const named: Record<string, string | null> = {}
    for (const [, file] of html.matchAll(
      /["']\/([^"'\s]+?\.(?:js|css))["']/g,
    )) {
      const onDisk = path.join(state.clientDir, file!)
      named[file!] = existsSync(onDisk) ? readFileSync(onDisk, 'utf8') : null
    }
    return { named, call }
  }
  /**
   * Once a client build phase ended after `since` such builds: what is
   * served, once it is `expected` or after a bound (the builds that follow
   * the client's, a server rebuild included, end within it).
   */
  const servedAfter = async (
    since: number,
    expected: (served: Served) => boolean,
  ): Promise<Served> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const start = Date.now()
    while (state.clientBuilt <= since) {
      if (Date.now() > start + 30_000) {
        throw new Error('test: the client did not build again')
      }
      await sleep(50)
    }
    const deadline = Date.now() + 10_000
    for (;;) {
      // (a server rebuild may be writing its files)
      const now = await served().catch(() => null)
      if ((now && expected(now)) || Date.now() > deadline) {
        return now ?? (await served())
      }
      await sleep(500)
    }
  }
  return { state, plugin, served, servedAfter }
}

/**
 * A watch run: the first build, then the client-only save `edit` with the
 * client's `fail` hook armed, then (seen through that failure) the fix.
 * Gives what was served after the first build, through the failure, and
 * after the fix, with the fix's builds.
 */
async function failedRebuild(
  edit: Record<string, string>,
  fail: null | 'generateBundle' | 'writeBundle',
  expected: (during: Served, first: Served) => boolean,
) {
  const builds = watchedBuilds()
  let first!: Served
  let during!: Served
  let built = 0
  const steps: Array<WatchStep> = [
    {
      edits: edit,
      when: async () => {
        first = await builds.served()
        builds.state.fail = fail
        built = builds.state.clientBuilt
      },
    },
    {
      edits: {
        'src/client-entry.ts': app['src/client-entry.ts'],
        'src/client-only.ts': clientOnly('MARK_FIXED'),
      },
      when: async () => {
        during = await builds.servedAfter(built, (now) => expected(now, first))
        builds.state.fail = null
      },
      rebuilds: ['ssr'],
    },
  ]
  const build = await buildStart({
    bundler: 'vite',
    files: app,
    entry,
    start,
    viteConfig: { plugins: [builds.plugin] },
    watchEdits: steps,
  })
  const after = await builds.served()
  return { first, during, after, build }
}

/** Each file a document names is the file on disk with these bytes. */
const bytesOf = (served: Served) => Object.values(served.named)

/** The fix's builds: the document names the last client build's files, whose bytes are on disk; the call answers. */
function expectRecovered(
  after: Served,
  build: Awaited<ReturnType<typeof buildStart>>,
) {
  const emitted = new Map(build.client.chunks.map((c) => [c.fileName, c.code]))
  const js = Object.keys(after.named).filter((file) => file.endsWith('.js'))
  expect(js.length).toBeGreaterThan(0)
  expect(
    Object.fromEntries(js.map((file) => [file, after.named[file]])),
  ).toEqual(
    Object.fromEntries(js.map((file) => [file, emitted.get(file) ?? null])),
  )
  expect(bytesOf(after).some((code) => code?.includes('MARK_FIXED'))).toBe(true)
  expect(after.call).toBe('MARK_GREET')
}

describe('vite build --watch: a client rebuild that fails', () => {
  // The client's rebuild fails in its build phase (an import that does not
  // resolve): nothing is written, and the server keeps the previous client
  // build: its document names the previous files, still on disk, and the
  // previous client's call is answered.
  // Source: whole-PR review S4-02 (V-41 through Start's own watch flow).
  test(
    'a failed transform: the document names the previous client files, and the previous call answers',
    async () => {
      const { first, during, after, build } = await failedRebuild(
        unresolvedImport,
        null,
        (now, before) => JSON.stringify(now) === JSON.stringify(before),
      )
      expect(Object.keys(first.named).length).toBeGreaterThan(0)
      expect(during).toEqual(first)
      expectRecovered(after, build)
    },
    timeout,
  )

  // Another plugin's `generateBundle` fails: Vite emptied the client's
  // output directory before rendering, and nothing is written. The server
  // names no client file (none is on disk), and is rebuilt once the client
  // builds again.
  // Source: Fable's settlement design rev 4 (`hook/probe4.mjs`).
  test.fails(
    "another plugin's generateBundle fails: the document names no client file",
    async () => {
      const { during, after, build } = await failedRebuild(
        { 'src/client-only.ts': clientOnly('MARK_EDIT') },
        'generateBundle',
        (now) => Object.keys(now.named).length === 0,
      )
      expect(during.named).toEqual({})
      expectRecovered(after, build)
    },
    timeout,
  )

  // Another plugin's `writeBundle` fails after the client's files are
  // written: the previous files are gone, and the document names the new
  // ones, with their bytes on disk.
  // Source: Astra's re-check of the settlement design (rev 3), finding 1.
  test.fails(
    "another plugin's writeBundle fails: the document names the new client files, on disk",
    async () => {
      const { during, after, build } = await failedRebuild(
        { 'src/client-only.ts': clientOnly('MARK_EDIT') },
        'writeBundle',
        (now) =>
          scripts(now).count > 0 &&
          scripts(now).missing.length === 0 &&
          bytesOf(now).some((code) => code?.includes('MARK_EDIT')),
      )
      expect(scripts(during).count).toBeGreaterThan(0)
      expect(scripts(during).missing).toEqual([])
      expect(bytesOf(during).some((code) => code?.includes('MARK_EDIT'))).toBe(
        true,
      )
      expectRecovered(after, build)
    },
    timeout,
  )
})

describe('vite build --watch: a fixed custom server fn id whose provider moves', () => {
  const moved = {
    'src/moved.ts': fns('MARK_MOVED'),
    'src/client-entry.ts': `export { getRouter } from './router'
export { label } from './client-only'
export { greet } from './moved'
`,
  }
  // The control: a build of the edited app answers the id with the moved
  // function.
  test(
    'a build of the app after the move answers the id with the moved function',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: { ...app, ...moved },
        entry,
        start,
      })
      const { result } = await build.ssr.run(callGreet)
      expect(result).toBe('MARK_MOVED')
    },
    timeout,
  )

  // `greet` keeps its custom id while its definition moves to another
  // module (the client imports it from there): the rebuilt server answers
  // the call of that id with the moved function.
  // Source: Astra's review of the settlement design, change 5.
  test.fails(
    'the call of the id answers the function at its new place',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: app,
        entry,
        start,
        watchEdits: [{ edits: moved, rebuilds: ['ssr'] }],
      })
      const { result } = await build.ssr.run(callGreet)
      expect(result).toBe('MARK_MOVED')
    },
    timeout,
  )
})

describe('hand-ordered builds: a client rebuild fails before the server builds', () => {
  // A program builds the client in watch mode, its rebuild fails (an
  // import that does not resolve), and then builds the server, as Start's
  // build-order error tells it to ("build `builder.environments.client`
  // before `builder.environments.ssr`"). The previous client build is the
  // one on disk: the server answers its call.
  // Source: whole-PR review S4-02 (V-41, Astra's `probe.mjs registry`).
  test.fails(
    'S4-02: the server answers the call of the last written client build',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: app,
        entry,
        start,
        viteConfig: { environments: { client: { build: { watch: {} } } } },
        viteBuild: async (builder) => {
          const watcher = (await builder.build(
            builder.environments.client!,
          )) as unknown as {
            on: (
              event: 'event',
              listener: (e: { code: string }) => void,
            ) => void
            close: () => Promise<void>
          }
          /** Resolves at the watcher's next event `code`; rejects after 20 s. */
          const next = (code: string) =>
            new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error(`test: no ${code} of the client`)),
                20_000,
              )
              watcher.on('event', (e) => {
                if (e.code === code) {
                  clearTimeout(timer)
                  resolve()
                }
              })
            })
          try {
            await next('BUNDLE_END')
            const failed = next('ERROR')
            for (const [file, text] of Object.entries(unresolvedImport)) {
              await writeFile(path.join(builder.config.root, file), text)
            }
            await failed
          } finally {
            await watcher.close()
          }
          await builder.build(builder.environments.ssr!)
        },
      })
      const { result } = await build.ssr.run(callGreet)
      expect(result).toBe('MARK_GREET')
    },
    timeout,
  )
})
