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
import { callByIdPrelude, inAppRequest } from '../build-harness'
import { buildStart } from '../build-start'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'
import type { Plugin } from 'vite'
import type { WatchStep } from '../build-harness'

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
export const Route = createFileRoute('/')({ component: () => <p>MARK_HOME</p> })
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
  /** The HTTP status of the document at `/`. */
  status: number
  /** Whether the document is the page (the index route's text), not an error page. */
  rendered: boolean
  /** The client files the server's document names, with their bytes on disk (null: none there). */
  named: Record<string, string | null>
  /** What a client call of `greet` (by its id) answers, or the error's message. */
  call: string
}

/**
 * The builds of a watch mode run, seen from outside: where each environment
 * writes, when a build hook last ran, how many server builds began, and how
 * many client builds failed. Also a plugin of the app that fails the
 * client's `generateBundle` or `writeBundle` while `fail` names it (another
 * plugin, placed after Start's).
 */
export function watchedBuilds() {
  const state = {
    clientDir: '',
    serverEntry: '',
    /** When a build hook of any environment last ran. */
    activeAt: 0,
    /** Server builds begun. */
    serverBuilds: 0,
    /** Client builds that failed: in the build phase (`buildEnd` with an error), or in the hook `fail` names. */
    clientFailures: 0,
    /**
     * Client builds that started rendering, and those written: a build
     * rendered and not written failed in its output phase (Start's own
     * `generateBundle`: a denied import under `behavior: 'error'`).
     */
    clientRenders: 0,
    clientWrites: 0,
    fail: null as null | 'generateBundle' | 'writeBundle',
  }
  const active = () => {
    state.activeAt = Date.now()
  }
  const plugin: Plugin = {
    name: 'test:watched-builds',
    buildStart() {
      active()
      if (this.environment.name === 'ssr') {
        state.serverBuilds++
      }
    },
    buildEnd(error) {
      active()
      if (this.environment.name === 'client' && error) {
        state.clientFailures++
      }
    },
    renderStart() {
      active()
      if (this.environment.name === 'client') {
        state.clientRenders++
      }
    },
    generateBundle() {
      active()
      if (
        this.environment.name === 'client' &&
        state.fail === 'generateBundle'
      ) {
        state.clientFailures++
        throw new Error('test: generateBundle fails')
      }
    },
    writeBundle(options, bundle) {
      active()
      if (this.environment.name === 'client') {
        state.clientWrites++
        state.clientDir = options.dir!
        if (state.fail === 'writeBundle') {
          state.clientFailures++
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
    closeBundle: active,
  }
  /** The document at `/`, its client files and their bytes, and the call's answer. */
  const served = async (): Promise<Served> => {
    const { stdout } = await runNodeProgram(
      `const result = await (async () => {
${inAppRequest(
  state.serverEntry,
  `const entry = globalThis.__tssBuildHarnessEntry
const response = await entry.startServerEntry.fetch(new Request('http://localhost/'))
const html = await response.text()
const call = await (async () => {
${callGreet}
})()
return { status: response.status, html, call }`,
)}
})()
process.stdout.write(JSON.stringify(result))`,
    )
    const { status, html, call } = JSON.parse(stdout) as {
      status: number
      html: string
      call: string
    }
    // every client URL the document names: a script's `src`, a link's
    // `href` (stylesheets, preloads) and an inline script's `import()`, with
    // or without an extension (a dev entry's `/@id/…` has none)
    const named: Record<string, string | null> = {}
    for (const [, , file] of html.matchAll(
      /(?:<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=|\bimport\(\s*)(["'])\/([^"'\s]+)\1/g,
    )) {
      const onDisk = path.join(state.clientDir, file!)
      named[file!] =
        existsSync(onDisk) && !file!.startsWith('@')
          ? readFileSync(onDisk, 'utf8')
          : null
    }
    return { status, rendered: html.includes(PAGE_TEXT), named, call }
  }
  /**
   * Once the client failed again after `failures` failures and the builds
   * are quiet (no build hook of any environment for `quietMs`: whatever the
   * failure starts, a server rebuild included, has ended): what is served,
   * and how many server builds began since `serverBuilds`.
   */
  const servedAfterFailure = async (
    failures: number,
    serverBuilds: number,
  ): Promise<{ served: Served; serverBuilds: number }> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const start = Date.now()
    while (
      state.clientFailures <= failures &&
      state.clientRenders === state.clientWrites
    ) {
      if (Date.now() > start + 30_000) {
        throw new Error('test: the client build did not fail')
      }
      await sleep(50)
    }
    while (Date.now() - state.activeAt < quietMs) {
      await sleep(100)
    }
    return {
      served: await served(),
      serverBuilds: state.serverBuilds - serverBuilds,
    }
  }
  return { state, plugin, served, servedAfterFailure }
}

/** The index route's text: a document with it is the page. */
const PAGE_TEXT = 'MARK_HOME'
/** How long the builds stay without a hook before what a failure starts counts as ended. */
const quietMs = 2_000

/**
 * A watch run: the first build (the page, its client files on disk, the
 * call answered: else it throws), then the client-only save `edit` with the
 * client's `fail` hook armed, then (seen once that failure happened and the
 * builds are quiet) the fix. Gives what was served after the first build,
 * through the failure (with the server builds it started), and after the
 * fix, with the fix's builds.
 */
export async function failedRebuild(
  edit: Record<string, string>,
  fail: null | 'generateBundle' | 'writeBundle',
  options: {
    /** Start's options over the app's (`start`). */
    start?: Record<string, unknown>
    /** The Vite config beside the watched-builds plugin. */
    viteConfig?: Record<string, unknown>
    /** More edits of the fix (`null` deletes a file the failing save added). */
    fix?: Record<string, string | null>
  } = {},
) {
  const builds = watchedBuilds()
  let first!: Served
  let during!: { served: Served; serverBuilds: number }
  let failures = 0
  let serverBuilds = 0
  const steps: Array<WatchStep> = [
    {
      edits: edit,
      when: async () => {
        first = await builds.served()
        const files = Object.values(first.named)
        if (
          first.status !== 200 ||
          !first.rendered ||
          files.length === 0 ||
          files.includes(null) ||
          first.call !== 'MARK_GREET'
        ) {
          throw new Error(
            `test: the first build does not serve the page: ${JSON.stringify({ ...first, named: Object.keys(first.named) })}`,
          )
        }
        builds.state.fail = fail
        failures = builds.state.clientFailures
        serverBuilds = builds.state.serverBuilds
      },
    },
    {
      edits: {
        'src/client-entry.ts': app['src/client-entry.ts'],
        'src/client-only.ts': clientOnly('MARK_FIXED'),
        ...options.fix,
      },
      when: async () => {
        during = await builds.servedAfterFailure(failures, serverBuilds)
        builds.state.fail = null
      },
      rebuilds: ['ssr'],
    },
  ]
  const build = await buildStart({
    bundler: 'vite',
    files: app,
    entry,
    start: { ...start, ...options.start },
    viteConfig: { ...options.viteConfig, plugins: [builds.plugin] },
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
  expect([after.status, after.rendered, after.call]).toEqual([
    200,
    true,
    'MARK_GREET',
  ])
}
