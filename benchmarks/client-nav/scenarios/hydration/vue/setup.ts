import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { JSDOM, VirtualConsole } from 'jsdom'
import {
  clientUrl,
  createDiagnostics,
  hashLinkCount,
  ordinaryLinkCount,
  serverUrl,
} from './fixture'
import type { FixtureArtifact } from './fixture'
import type * as Client from './src/client'

type ClientApp = typeof Client
type TaskHooks = {
  opts: {
    beforeEach?: () => void | Promise<void>
    afterEach?: () => void | Promise<void>
  }
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve))
const maxSettleTurns = 100

export function setup({ countRenders = false } = {}) {
  // Compile outside measurement; evaluation creates fresh module and payload
  // objects in each sample's window, including Vue's cached DOM references.
  const artifact: FixtureArtifact = JSON.parse(
    readFileSync(new URL('./dist/fixture.json', import.meta.url), 'utf8'),
  )
  const clientPath = new URL('./dist/client/client.js', import.meta.url)
  const clientScript = new Script(readFileSync(clientPath, 'utf8'), {
    filename: fileURLToPath(clientPath),
  })
  const bootstrapScripts = artifact.scripts.map(
    (source, index) =>
      new Script(source, { filename: `hydration-bootstrap-${index}.js` }),
  )
  let current: Awaited<ReturnType<typeof prepare>> | undefined

  async function prepare() {
    const errors: Array<string> = []
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', (error) => errors.push(String(error)))
    virtualConsole.on('error', (...args) =>
      errors.push(args.map(String).join(' ')),
    )
    virtualConsole.on('warn', (...args) =>
      errors.push(args.map(String).join(' ')),
    )
    const dom = new JSDOM(artifact.html, {
      url: `http://localhost${clientUrl}`,
      runScripts: 'outside-only',
      virtualConsole,
    })
    const immediates = new Set<NodeJS.Immediate>()
    try {
      Object.assign(dom.window, {
        TextEncoder,
        TextDecoder,
        ReadableStream,
        WritableStream,
        TransformStream,
        setImmediate(
          callback: (...args: Array<unknown>) => void,
          ...args: Array<unknown>
        ) {
          const handle = setImmediate(() => {
            immediates.delete(handle)
            callback(...args)
          })
          immediates.add(handle)
          return handle
        },
        clearImmediate(handle: NodeJS.Immediate) {
          immediates.delete(handle)
          clearImmediate(handle)
        },
        fetch() {
          throw new Error('Hydration attempted a network request')
        },
        scrollTo() {},
      })
      const context = dom.getInternalVMContext()
      // jsdom has no layout/scroll implementation; measure hydration CPU only.
      dom.window.HTMLElement.prototype.scrollIntoView = () => {}
      clientScript.runInContext(context)
      const app = (dom.window as unknown as { HydrationBenchmark: ClientApp })
        .HydrationBenchmark
      assert.equal(app.serverEnvironment, false)
      const doc = dom.window.document
      const anchors = Array.from(doc.querySelectorAll('a'))
      const scriptElements = Array.from(doc.querySelectorAll('script'))
      const executingScript = { current: null as HTMLScriptElement | null }
      Object.defineProperty(doc, 'currentScript', {
        configurable: true,
        get: () => executingScript.current,
      })
      assert.equal(anchors.length, ordinaryLinkCount + hashLinkCount)
      assert.equal(scriptElements.length, bootstrapScripts.length)
      const content = doc.getElementById('hydration-content')
      const interactive = doc.getElementById('interactive')
      assert.ok(content)
      assert.ok(interactive)
      for (let index = 0; index < hashLinkCount; index++) {
        assert.equal(
          doc.getElementById(`hash-${index}`)?.getAttribute('data-status'),
          null,
        )
      }
      // Finish jsdom's document lifecycle before opening the measure.
      await turn()
      assert.equal(doc.readyState, 'complete')
      assert.equal(app.ready(), false)
      assert.deepEqual(
        JSON.parse(JSON.stringify(app.snapshot().diagnostics)),
        createDiagnostics(),
      )
      assert.equal(app.snapshot().matches, undefined)
      assert.equal(
        (dom.window as unknown as { $_TSR?: unknown }).$_TSR,
        undefined,
      )
      return {
        dom,
        context,
        app,
        anchors,
        content,
        interactive,
        scriptElements,
        executingScript,
        immediates,
        errors,
        started: false,
        completed: false,
        failed: false,
      }
    } catch (error) {
      for (const handle of immediates) {
        clearImmediate(handle)
      }
      dom.window.close()
      throw error
    }
  }

  async function before() {
    if (current) {
      throw new Error('Previous hydration sample was not disposed')
    }
    current = await prepare()
  }

  async function run() {
    const sample = current
    if (!sample || sample.started) {
      throw new Error('Hydration requires a newly prepared sample')
    }
    sample.started = true
    try {
      // Payload execution, router initialization/restoration, DOM hydration and
      // Vue's post-mount flushes are all inside the measurement.
      for (let index = 0; index < bootstrapScripts.length; index++) {
        sample.executingScript.current = sample.scriptElements[index]!
        try {
          bootstrapScripts[index]!.runInContext(sample.context)
        } finally {
          sample.executingScript.current = null
        }
      }
      await sample.app.start(countRenders)
      let idleTurns = 0
      for (let index = 0; index < maxSettleTurns; index++) {
        await turn()
        await sample.app.flush()
        if (sample.errors.length) {
          throw new Error(sample.errors.join('\n'))
        }
        if (sample.app.ready() && sample.immediates.size === 0) {
          if (++idleTurns === 2) {
            sample.completed = true
            return
          }
        } else {
          idleTurns = 0
        }
      }
      throw new Error(
        `Hydration did not settle: ${JSON.stringify(sample.app.snapshot())}`,
      )
    } catch (error) {
      sample.failed = true
      throw error
    }
  }

  function snapshot() {
    if (!current) {
      throw new Error('No hydration sample')
    }
    // Normalize realm prototypes only for untimed assertions.
    return JSON.parse(JSON.stringify(current.app.snapshot())) as ReturnType<
      ClientApp['snapshot']
    >
  }

  function validate() {
    assert.ok(current?.started)
    const { dom, anchors, content, interactive, errors } = current
    const doc = dom.window.document
    const result = snapshot()
    assert.deepEqual(errors, [])
    assert.deepEqual(result.errors, [])
    assert.equal(result.diagnostics.beforeLoads, 0)
    assert.equal(result.diagnostics.loaders, 0)
    assert.equal(result.diagnostics.mounted, true)
    assert.equal(result.diagnostics.clicks, 0)
    assert.equal(result.location, clientUrl)
    assert.equal(result.matches?.length, 3)
    for (const match of result.matches) {
      assert.equal(match.status, 'success')
      assert.deepEqual(match.context.viewer, {
        id: 'viewer-3',
        name: 'Ada',
        role: 'editor',
      })
    }
    assert.equal(result.matches[0]!.loaderData, undefined)
    assert.deepEqual(result.matches[1]!.context.team, {
      id: 'team-7',
      member: 'viewer-3',
    })
    assert.deepEqual(result.matches[2]!.context.team, {
      id: 'team-7',
      member: 'viewer-3',
    })
    assert.deepEqual(result.matches[2]!.context.permissions, { edit: true })
    assert.deepEqual(result.matches[1]!.loaderData, {
      title: 'Team team-7',
      categories: ['open', 'closed'],
    })
    const data = result.matches[2]!.loaderData as {
      owner: string
      selected: string
      rows: Array<{
        id: string
        label: string
        details: { score: number; open: boolean }
      }>
    }
    assert.equal(data.owner, 'viewer-3')
    assert.equal(data.selected, 'item-42')
    assert.equal(data.rows.length, ordinaryLinkCount)
    assert.equal(doc.getElementById('hydration-content'), content)
    assert.equal(doc.getElementById('interactive'), interactive)
    assert.equal(doc.querySelectorAll('a').length, anchors.length)
    assert.equal(doc.querySelector('h1')?.textContent, 'Team team-7')
    assert.equal(doc.getElementById('viewer')?.textContent, 'Ada')
    assert.equal(doc.getElementById('permission')?.textContent, 'Editable')
    for (const anchor of anchors) {
      assert.equal(doc.getElementById(anchor.id), anchor)
    }
    for (let index = 0; index < ordinaryLinkCount; index++) {
      const anchor = doc.getElementById(`ordinary-item-${index}`)!
      assert.equal(
        anchor.getAttribute('href'),
        `/teams/team-7/items/item-${index}?view=summary`,
      )
      assert.equal(anchor.textContent, `Item ${index}`)
      assert.equal(
        anchor.getAttribute('data-status'),
        index === 42 ? 'active' : null,
      )
      assert.deepEqual(data.rows[index], {
        id: `item-${index}`,
        label: `Item ${index}`,
        details: { score: index * 3, open: index % 2 === 0 },
      })
    }
    for (let index = 0; index < hashLinkCount; index++) {
      const anchor = doc.getElementById(`hash-${index}`)!
      assert.equal(
        anchor.getAttribute('href'),
        `${serverUrl}#${index % 2 === 0 ? 'details' : 'other'}`,
      )
      assert.equal(anchor.textContent, `Section ${index}`)
      assert.equal(
        anchor.getAttribute('data-status'),
        index % 2 === 0 ? 'active' : null,
        `hash-${index} must reflect the client hash after hydration`,
      )
      assert.equal(anchor.classList.contains('active'), index % 2 === 0)
      assert.equal(
        anchor.getAttribute('aria-current'),
        index % 2 === 0 ? 'page' : null,
      )
    }
    interactive.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true }),
    )
    assert.equal(current.app.snapshot().diagnostics.clicks, 1)
  }

  async function after() {
    const sample = current
    if (!sample) {
      return
    }
    try {
      if (!sample.failed) {
        assert.ok(sample.completed, 'Hydration sample was not completed')
        validate()
      }
    } finally {
      current = undefined
      try {
        await sample.app.dispose()
        // Unmount and its queued effects stay outside measurement.
        await turn()
        await turn()
      } finally {
        for (const handle of sample.immediates) {
          clearImmediate(handle)
        }
        sample.dom.window.close()
      }
    }
  }

  return {
    before,
    run,
    after,
    snapshot,
    // Vitest's Bench setup runs once per stage. Install the Task's public
    // per-iteration hooks so every warmup and measured iteration gets a realm.
    installIterationHooks(task: TaskHooks) {
      task.opts.beforeEach = before
      task.opts.afterEach = after
    },
  }
}
