/**
 * Controls of the fixtures (test.ts): a probe file uses them in a Vitest of
 * its own (a child Node process) whose run directory is a directory of this
 * file's, and records what happened (`log`). Then each row reads the
 * outcome of the probe's tests, the records, and what the run left on disk.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect } from 'vitest'
import { createAppDirectory } from '../../src/app-directory'
import { runNodeProgram } from '../../src/run-node'
import { test } from '../../src/test'

const packageDirectory = path.dirname(path.dirname(import.meta.dirname))

/**
 * The probe. Each test records events as JSON lines: what closed and in
 * which order (`closed`), whether its `appRoot` was still there at that
 * point, and whether a test body went on after an await (`resumed`). A
 * test after each subject test records whether the subject's `appRoot`
 * survived it.
 */
const probe = `import { appendFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect } from 'vitest'
import { test } from ${JSON.stringify(path.join(packageDirectory, 'src/test.ts'))}

const dir = ${JSON.stringify(packageDirectory)}
const log = (event) => appendFileSync(process.env.PROBE_LOG, JSON.stringify(event) + '\\n')
const app = { 'index.html': '<p>app</p>', 'src/entry.ts': 'export {}\\n' }
/** Records the close of a Vite dev server, and the listening of its port. */
const vitePlugin = (name, appRoot, hooks = {}) => ({
  name: 'probe-' + name,
  configureServer(server) {
    server.httpServer?.on('listening', () => log({ listening: name, port: server.httpServer.address().port }))
    return hooks.configureServer?.()
  },
  closeServer() {
    log({ closed: name, appRoot: existsSync(appRoot) })
    hooks.closeServer?.()
  },
})
const rsbuildPlugin = (name, appRoot, hooks = {}) => ({
  name: 'probe-' + name,
  setup(api) {
    api.onBeforeCreateCompiler(() => hooks.beforeCreateCompiler?.())
    api.onDevCompileDone(() => log({ compiled: name }))
    api.onCloseDevServer(() => log({ closed: name, appRoot: existsSync(appRoot) }))
  },
})
/** Resolves a moment after the test's signal aborted (the test timed out). */
const afterAbort = (signal) =>
  new Promise((resolve) => signal.addEventListener('abort', () => setTimeout(resolve, 200)))
let previous
const survived = (name) => log({ survived: name, appRoot: existsSync(previous) })

test('order', async ({ appRoot, page, devServer, rsbuildServer, build, onTestFinished }) => {
  previous = appRoot
  page.on('close', () => log({ closed: 'page', appRoot: existsSync(appRoot) }))
  await page.goto('about:blank')
  await devServer({ dir, files: app, listen: true, plugins: [vitePlugin('vite', appRoot)] })
  await build({ dir, bundler: 'vite', entry: 'src/entry.ts', files: app })
  await rsbuildServer({ dir, files: app, plugins: [rsbuildPlugin('rsbuild', appRoot)] })
  log({ apps: readdirSync(appRoot).length })
})
test('after order', () => survived('order'))

test('a close that throws', async ({ appRoot, devServer }) => {
  previous = appRoot
  await devServer({ dir, files: app, plugins: [vitePlugin('first', appRoot)] })
  await devServer({
    dir,
    files: app,
    plugins: [vitePlugin('throws', appRoot, { closeServer: () => { throw new Error('MARK_CLOSE') } })],
  })
})
test('after a close that throws', () => survived('a close that throws'))

test('a timeout during a Vite start', { timeout: 500 }, async ({ appRoot, devServer, signal }) => {
  previous = appRoot
  await devServer({
    dir,
    files: app,
    listen: true,
    plugins: [vitePlugin('held vite', appRoot, { configureServer: () => afterAbort(signal) })],
  })
  log({ resumed: 'vite' })
})
test('after a timeout during a Vite start', () => survived('a timeout during a Vite start'))

test('a timeout during an Rsbuild start', { timeout: 500 }, async ({ appRoot, rsbuildServer, signal }) => {
  previous = appRoot
  await rsbuildServer({
    dir,
    files: app,
    plugins: [rsbuildPlugin('held rsbuild', appRoot, { beforeCreateCompiler: () => afterAbort(signal) })],
  })
  log({ resumed: 'rsbuild' })
})
test('after a timeout during an Rsbuild start', () => survived('a timeout during an Rsbuild start'))

test('a timeout during a build', { timeout: 500 }, async ({ appRoot, build, signal }) => {
  previous = appRoot
  await build({
    dir,
    bundler: 'vite',
    entry: 'src/entry.ts',
    files: app,
    plugins: {
      vite: () => ({
        name: 'held',
        // (whether the test's directory is still there for the build to write into)
        buildStart: () => afterAbort(signal).then(() => log({ buildResumed: existsSync(appRoot) })),
      }),
    },
  })
  log({ resumed: 'build' })
})
test('after a timeout during a build', () => survived('a timeout during a build'))

test('a second open after a timeout', { timeout: 300 }, async ({ appRoot, devServer, signal }) => {
  previous = appRoot
  await new Promise((resolve) => signal.addEventListener('abort', resolve))
  await devServer({ dir, files: app }).then(
    () => log({ second: 'opened' }),
    (error) => log({ second: error.name, apps: existsSync(appRoot) ? readdirSync(appRoot).length : 0 }),
  )
})
test('after a second open after a timeout', async () => {
  // (the second open of the timed-out test ran meanwhile)
  await new Promise((resolve) => setTimeout(resolve, 200))
  survived('a second open after a timeout')
})

/** A file outside every app, which the failing Vite plugin below watches. */
const outside = path.join(path.dirname(process.env.PROBE_LOG), 'outside.txt')
writeFileSync(outside, 'v1')
test('a failed start', async ({ appRoot, devServer, rsbuildServer }) => {
  previous = appRoot
  const watchesThenFails = {
    name: 'fails',
    configureServer(server) {
      server.watcher.add(outside)
      server.watcher.on('change', (file) => file === outside && log({ watched: 'failed vite' }))
      throw new Error('MARK_VITE')
    },
  }
  await expect(devServer({ dir, files: app, plugins: [watchesThenFails] })).rejects.toThrow('MARK_VITE')
  await expect(
    rsbuildServer({ dir, files: app, plugins: [{ name: 'fails', setup() { throw new Error('MARK_RSBUILD') } }] }),
  ).rejects.toThrow('MARK_RSBUILD')
})
test('after a failed start', async () => {
  survived('a failed start')
  // (an edit the failed server's watcher would report)
  writeFileSync(outside, 'v2')
  await new Promise((resolve) => setTimeout(resolve, 1000))
})

test('a test that fails with a page open', async ({ page }) => {
  await page.goto('about:blank')
  throw new Error('MARK_FAILED')
})
test('after a test that fails with a page open', ({ browser }) => {
  log({ contexts: browser.contexts().length })
})

let lateOpen
test('a timeout during the first import of an opener', { timeout: 300 }, async ({ appRoot, rsbuildPluginHost }) => {
  previous = appRoot
  lateOpen = rsbuildPluginHost({ dir, files: app }).then(
    () => log({ lateImport: 'opened' }),
    (error) => log({ lateImport: error.name, code: error.code }),
  )
  await lateOpen
})
test('after a timeout during the first import of an opener', async () => {
  survived('a timeout during the first import of an opener')
  writeFileSync(process.env.PROBE_RELEASE, '')
  await lateOpen
})

// (what U8's probe showed of Vitest's global onTestFinished: in concurrent
// tests it attaches to the test that started last)
describe.concurrent('concurrent', () => {
  test('a slow start in a long test', async ({ appRoot, devServer }) => {
    const slow = { configureServer: () => new Promise((resolve) => setTimeout(resolve, 300)) }
    await devServer({ dir, files: app, plugins: [vitePlugin('slow', appRoot, slow)] })
    await new Promise((resolve) => setTimeout(resolve, 300))
    log({ ends: 'slow' })
  })
  test('a quick test', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    log({ ends: 'quick' })
  })
})
`

/**
 * A test of each probe file: records the file's `fileRoot` and the
 * `workerRoot`, and whether the `fileRoot` of a file that ran before is
 * still there.
 */
const fileRow = (
  name: string,
) => `import { appendFileSync as append, existsSync as exists, readFileSync } from 'node:fs'
test('${name}', ({ fileRoot, workerRoot }) => {
  for (const line of readFileSync(process.env.PROBE_LOG, 'utf8').split('\\n').filter(Boolean)) {
    const event = JSON.parse(line)
    if ('fileRoot' in event) {
      append(process.env.PROBE_LOG, JSON.stringify({ earlierFileRoot: exists(event.fileRoot) }) + '\\n')
    }
  }
  append(process.env.PROBE_LOG, JSON.stringify({ fileRoot, workerRoot }) + '\\n')
})
`

/** What the probe's run gave: each test's state and errors, the records, what is left. */
interface ProbeRun {
  tests: Record<string, { state: string; errors: Array<string> }>
  events: Array<Record<string, unknown>>
  left: Array<string>
}

const run = test.extend(
  'probe',
  { scope: 'file' },
  async ({ fileRoot }): Promise<ProbeRun> => {
    const root = await createAppDirectory(packageDirectory, '.probe-', fileRoot)
    const runDir = path.join(root, 'run')
    const logFile = path.join(root, 'events.log')
    await writeFile(
      path.join(root, 'fixtures.test.ts'),
      probe + fileRow('the first file'),
    )
    await writeFile(
      path.join(root, 'second.test.ts'),
      `import { test } from ${JSON.stringify(path.join(packageDirectory, 'src/test.ts'))}\n${fileRow('the second file')}`,
    )
    await writeFile(logFile, '')
    await mkdir(runDir)
    const { stdout } = await runNodeProgram(
      `import { startVitest } from 'vitest/node'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
const vitest = await startVitest('test', [], {
  root: ${JSON.stringify(root)},
  config: false,
  watch: false,
  reporters: [],
  // (one worker that keeps its modules across files, as router-generator's)
  maxWorkers: 1,
  isolate: false,
}, {
  plugins: [{
    // The first import of the Rsbuild plugin host's module takes until the
    // probe releases it (a cold import that outlasts the test's timeout)
    name: 'hold-first-import',
    async transform(_code, id) {
      if (id.endsWith('/src/rsbuild-plugin-host.ts')) {
        while (!existsSync(process.env.PROBE_RELEASE)) await sleep(20)
      }
    },
  }],
})
const tests = {}
const record = (task) => {
  if (task.type === 'suite') {
    task.tasks.forEach(record)
    return
  }
  tests[task.name] = {
    state: task.result?.state,
    errors: (task.result?.errors ?? []).map((error) => error.name + ': ' + error.message),
  }
}
vitest.state.getFiles().forEach((file) => file.tasks.forEach(record))
await vitest.close()
process.stdout.write('\\n' + JSON.stringify(tests))
process.exit(0)
`,
      {
        cwd: root,
        env: {
          ...process.env,
          TANSTACK_COMPILER_TESTS_RUN_DIR: runDir,
          PROBE_LOG: logFile,
          PROBE_RELEASE: path.join(root, 'release'),
        },
      },
    )
    return {
      tests: JSON.parse(stdout.trim().split('\n').at(-1)!),
      events: (await readFile(logFile, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
      left: await readdir(runDir, { recursive: true }),
    }
  },
)

/** The records of closes, in order. */
const closes = (events: ProbeRun['events']) =>
  events.filter((event) => 'closed' in event)

run(
  'the page closes first, then the servers, newest first, then the test’s directory',
  ({ probe }) => {
    expect(probe.tests.order).toEqual({ state: 'pass', errors: [] })
    // (what the start rows read is recorded)
    expect(probe.events).toContainEqual(
      expect.objectContaining({ listening: 'vite' }),
    )
    expect(probe.events).toContainEqual({ compiled: 'rsbuild' })
    const events = probe.events.slice(
      probe.events.findIndex((event) => 'apps' in event),
    )
    // (the page, the two servers and the build each had a directory of their own)
    expect(events[0]).toEqual({ apps: 3 })
    expect(closes(events).slice(0, 3)).toEqual([
      { closed: 'page', appRoot: true },
      { closed: 'rsbuild', appRoot: true },
      { closed: 'vite', appRoot: true },
    ])
    expect(probe.events).toContainEqual({ survived: 'order', appRoot: false })
  },
)

run(
  'a close that throws fails the test, and the others still close',
  ({ probe }) => {
    expect(probe.tests['a close that throws']).toEqual({
      state: 'fail',
      errors: [expect.stringContaining('MARK_CLOSE')],
    })
    expect(closes(probe.events)).toEqual(
      expect.arrayContaining([
        { closed: 'throws', appRoot: true },
        { closed: 'first', appRoot: true },
      ]),
    )
    expect(probe.events).toContainEqual({
      survived: 'a close that throws',
      appRoot: false,
    })
  },
)

run.for(['Vite', 'Rsbuild'] as const)(
  'a timeout during a %s start: the test goes no further, the server never listens and is closed',
  (bundler, { probe }) => {
    const name = `a timeout during a${bundler === 'Vite' ? '' : 'n'} ${bundler} start`
    expect(probe.tests[name]).toEqual({
      state: 'fail',
      errors: [expect.stringMatching(/^TestTimeoutError: /)],
    })
    const server = `held ${bundler.toLowerCase()}`
    // (the start stopped at its next step: no port, no compile)
    expect(probe.events).not.toContainEqual(
      expect.objectContaining({ listening: server }),
    )
    expect(probe.events).not.toContainEqual({ compiled: server })
    expect(probe.events).not.toContainEqual({
      resumed: bundler.toLowerCase(),
    })
    expect(closes(probe.events)).toContainEqual({
      closed: server,
      appRoot: true,
    })
    expect(probe.events).toContainEqual({ survived: name, appRoot: false })
  },
)

run(
  'a timeout during a build: the test goes no further, and its directory goes once the build ended',
  ({ probe }) => {
    expect(probe.tests['a timeout during a build']).toEqual({
      state: 'fail',
      errors: [expect.stringMatching(/^TestTimeoutError: /)],
    })
    expect(probe.events).not.toContainEqual({ resumed: 'build' })
    // (the build still had the test's directory when it went on)
    expect(probe.events).toContainEqual({ buildResumed: true })
    expect(probe.events).toContainEqual({
      survived: 'a timeout during a build',
      appRoot: false,
    })
  },
)

run(
  'an open after the test timed out is refused, and creates nothing',
  ({ probe }) => {
    expect(probe.tests['a second open after a timeout']).toEqual({
      state: 'fail',
      errors: [expect.stringMatching(/^TestTimeoutError: /)],
    })
    expect(probe.events).toContainEqual({ second: 'TestTimeoutError', apps: 0 })
    expect(probe.events).toContainEqual({
      survived: 'a second open after a timeout',
      appRoot: false,
    })
  },
)

run(
  'a start that fails closes what it started, and the test goes on',
  ({ probe }) => {
    expect(probe.tests['a failed start']).toEqual({ state: 'pass', errors: [] })
    expect(probe.events).toContainEqual({
      survived: 'a failed start',
      appRoot: false,
    })
  },
)

// Bug (upstream, Vite 8.3.8): a server whose plugin throws from
// `configureServer` keeps its file watcher: `createServer` creates the
// watcher before it awaits the hook, and rejects without closing it. The
// harness gets no server to close (bare Vite reproduces it).
// Source: vite/dist/node/chunks/node.js `_createServer` (the watcher is set up
// before `configureServer` hooks run).
// Impact: each such failed start leaves a watcher, and its edits' events, in
// the process for good.
run.fails(
  'a Vite start whose plugin throws from configureServer leaves no file watcher',
  ({ probe }) => {
    // (the edit after the test reached no watcher)
    expect(probe.events).not.toContainEqual({ watched: 'failed vite' })
  },
)

run(
  'an opener whose import outlasts the test opens nothing once it is imported',
  ({ probe }) => {
    expect(
      probe.tests['a timeout during the first import of an opener'],
    ).toEqual({
      state: 'fail',
      errors: [expect.stringMatching(/^TestTimeoutError: /)],
    })
    // (refused at the test's signal, not by the removed directory)
    expect(probe.events).toContainEqual({ lateImport: 'TestTimeoutError' })
    expect(probe.events).toContainEqual({
      survived: 'a timeout during the first import of an opener',
      appRoot: false,
    })
  },
)

run(
  'a file’s directory goes when the file ended, in the worker’s',
  ({ probe }) => {
    const roots = probe.events.filter((event) => 'fileRoot' in event)
    expect(roots).toHaveLength(2)
    expect(roots[0]!.fileRoot).not.toBe(roots[1]!.fileRoot)
    expect(roots[0]!.workerRoot).toBe(roots[1]!.workerRoot)
    expect(path.dirname(roots[0]!.fileRoot as string)).toBe(
      roots[0]!.workerRoot,
    )
    // (checked by the file that ran second)
    expect(probe.events.filter((event) => 'earlierFileRoot' in event)).toEqual([
      { earlierFileRoot: false },
    ])
  },
)

run(
  'a test that fails with a page open leaves no browser context',
  ({ probe }) => {
    expect(probe.tests['a test that fails with a page open']).toEqual({
      state: 'fail',
      errors: [expect.stringContaining('MARK_FAILED')],
    })
    expect(probe.events).toContainEqual({ contexts: 0 })
  },
)

run(
  'in concurrent tests, what a test opened closes when that test ends',
  ({ probe }) => {
    expect(
      probe.events.flatMap((event) =>
        'ends' in event
          ? [`${event.ends} ends`]
          : event.closed === 'slow'
            ? ['slow closed']
            : [],
      ),
    ).toEqual(['quick ends', 'slow ends', 'slow closed'])
  },
)

run('nothing is left in the run’s directory', ({ probe }) => {
  // (the probe's tests ran: this is not an empty run)
  expect(Object.keys(probe.tests)).toHaveLength(22)
  expect(probe.left).toEqual([])
})
