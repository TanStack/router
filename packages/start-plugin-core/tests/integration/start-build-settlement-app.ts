/**
 * The app and the helpers of the settlement rows of `vite build --watch`
 * (`start-build-settlement*.test.ts`, settlement design step 0, rev 4's
 * step-7 list): a page app whose client calls a server fn of a fixed id, the
 * builds of a watch run seen from outside (a plugin of the app placed after
 * Start's that can fail the client's `generateBundle` or `writeBundle`), and
 * what the server serves at a moment: the document's client files with their
 * bytes on disk, and the client's call.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { expect } from 'vitest'
import { buildStart, callByIdPrelude, inAppRequest } from '../build-harness'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'
import type { Plugin } from 'vite'
import type { WatchStep } from '../build-harness'

export const timeout = 90_000

export const fns = (
  marker: string,
) => `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => '${marker}')
`
export const clientOnly = (marker: string) =>
  `export const label = '${marker}'\n`

/** A page app whose client entry exposes `label` (a module only the client bundles) and calls `greet`. */
export const app = {
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
export const entry = { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' }
/**
 * A save of the client entry that stops calling `greet` and imports a file
 * that does not exist: the client's build fails in its build phase.
 */
export const unresolvedImport = {
  'src/client-entry.ts': `export { getRouter } from './router'
import './not-yet-created'
`,
}
/** The JavaScript files a document names whose bytes are on disk, and those missing. */
export const scripts = (served: Served) => {
  const js = Object.keys(served.named).filter((file) => file.endsWith('.js'))
  return {
    count: js.length,
    missing: js.filter((file) => served.named[file] === null),
  }
}
/** Start's options: `greet` has a fixed id, so a call names it across builds. */
export const start = {
  serverFns: {
    generateFunctionId: ({ functionName }: { functionName: string }) =>
      functionName.startsWith('greet') ? 'greet_fixed' : undefined,
  },
}

/** An SSR script: what a client call of `greet` (by its id) answers, or the error's message. */
export const callGreet = `${callByIdPrelude}try {
  return await callById('greet_fixed')
} catch (error) {
  return String(error?.message ?? error)
}`

/** What the client builds and the server, as the app's host serves them, give at one moment. */
export interface Served {
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
export function watchedBuilds() {
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
export async function failedRebuild(
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
export const bytesOf = (served: Served) => Object.values(served.named)

/** The fix's builds: the document names the last client build's files, whose bytes are on disk; the call answers. */
export function expectRecovered(
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
