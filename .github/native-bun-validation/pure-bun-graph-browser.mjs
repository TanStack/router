import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  writeFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root =
  process.env.ROUTER_REPOSITORY_ROOT ??
  fileURLToPath(new URL('../../../', import.meta.url))
const requireProject = createRequire(
  path.join(root, 'e2e/react-router/bun-basic-file-based/package.json'),
)
const { chromium, expect } = requireProject('@playwright/test')
const sourceMapMode = process.env.PURE_BUN_SOURCE_MAPS === '1'
const largePairMode = process.env.PURE_BUN_LARGE_PAIR === '1'
const pluginRequire = createRequire(
  path.join(root, 'packages/router-plugin/package.json'),
)
const babelRequire = createRequire(pluginRequire.resolve('@babel/core'))
const { AnyMap, originalPositionFor, sourceContentFor } = createRequire(
  babelRequire.resolve('@jridgewell/remapping'),
)('@jridgewell/trace-mapping')
const binaries = [
  ['candidate', process.env.BUN_EXECUTABLE],
  ['baseline', process.env.BUN_BASELINE_EXECUTABLE],
  ['debug', process.env.BUN_DEBUG_EXECUTABLE],
].filter(([, binary]) => binary)
assert.ok(binaries.length, 'Set BUN_EXECUTABLE')
const output =
  process.env.PURE_BUN_BROWSER_OUTPUT ??
  path.join(
    root,
    `.cache/bun-dev-validation/results/pure-bun-graph-${process.platform}.json`,
  )
await mkdir(path.dirname(output), { recursive: true })
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
})
const results = []
const mentions = (text) =>
  ['before.ts', 'after.ts', 'graph.ts', 'main.ts'].filter((name) =>
    text.includes(name),
  )
try {
  for (const [label, binary] of binaries) {
    for (const reloadWhileAfter of sourceMapMode
      ? [true]
      : largePairMode
        ? [false]
        : [false, true]) {
      const name = `${label}-${reloadWhileAfter ? 'reload-B' : 'automatic'}`
      console.log(`START ${name}`)
      const directory = await realpath(
        await mkdtemp(path.join(tmpdir(), 'bun-pure-graph-')),
      )
      const result = {
        name,
        label,
        binary,
        reloadWhileAfter,
        sourceMapMode,
        largePairMode,
        passed: false,
        steps: [],
        errors: [],
        websocketFrames: [],
        initialJavaScript: [],
        documentLoads: 0,
      }
      let child,
        context,
        logs = ''
      try {
        await writeFile(
          path.join(directory, 'index.html'),
          '<!doctype html><div id="app"></div><script type="module" src="./main.ts"></script>',
        )
        await writeFile(
          path.join(directory, 'main.ts'),
          `import {value} from './graph.ts';document.querySelector('#app').textContent=value;if(import.meta.hot)import.meta.hot.accept();`,
        )
        await writeFile(
          path.join(directory, 'graph.ts'),
          `export {value} from './before.ts';`,
        )
        await writeFile(
          path.join(directory, 'before.ts'),
          `export const value='BEFORE';`,
        )
        await writeFile(
          path.join(directory, 'after.ts'),
          `export const value='AFTER';`,
        )
        const authoredSource = `export const value = 'BEFORE';\nexport function authoredThrow() {\n  throw new Error('CACHED_CLOSURE_AUTHORED_THROW');\n}\n`
        if (sourceMapMode) {
          await writeFile(
            path.join(directory, 'before.ts'),
            `export {value, authoredThrow} from './cached-leaf.ts';`,
          )
          await writeFile(
            path.join(directory, 'cached-leaf.ts'),
            authoredSource,
          )
          await writeFile(
            path.join(directory, 'after.ts'),
            `export const value='AFTER';export function authoredThrow(){throw new Error('UNEXPECTED_AFTER_THROW')}`,
          )
          await writeFile(
            path.join(directory, 'main.ts'),
            `import {value,authoredThrow} from './graph.ts';document.querySelector('#app').textContent=value;globalThis.__throwCached=authoredThrow;if(import.meta.hot)import.meta.hot.accept();`,
          )
          await writeFile(
            path.join(directory, 'graph.ts'),
            `export {value,authoredThrow} from './before.ts';`,
          )
        }
        if (largePairMode) {
          await writeFile(
            path.join(directory, 'shared.ts'),
            `globalThis.sharedInits=(globalThis.sharedInits??0)+1;export const shared={initializations:globalThis.sharedInits};`,
          )
          await writeFile(
            path.join(directory, 'after.ts'),
            `import {shared} from './shared.ts';export {shared};export const value='AFTER';export const padding={${Array.from({ length: Number(process.env.PURE_BUN_LARGE_FUNCTIONS ?? 40000) }, (_, index) => `k${index}:()=>${index}`).join(',')}};`,
          )
          await writeFile(
            path.join(directory, 'before.ts'),
            `import {shared} from './shared.ts';export {shared};export const value='BEFORE';`,
          )
          await writeFile(
            path.join(directory, 'graph.ts'),
            `export {value,shared} from './before.ts';`,
          )
          await writeFile(
            path.join(directory, 'main.ts'),
            `import {value,shared} from './graph.ts';import {shared as stable} from './shared.ts';document.querySelector('#app').textContent=value;globalThis.__pureShared={identity:shared===stable,initializations:shared.initializations};if(import.meta.hot){import.meta.hot.accept();import.meta.hot.on('bun:beforeUpdate',()=>console.debug('__PURE_LIFECYCLE__before'));import.meta.hot.on('bun:afterUpdate',()=>console.debug('__PURE_LIFECYCLE__after'));}`,
          )
        }
        await writeFile(
          path.join(directory, 'server.ts'),
          `import html from './index.html';const server=Bun.serve({hostname:'127.0.0.1',port:0,development:{hmr:true},routes:{'/__info':()=>Response.json({pid:process.pid}),'/*':html}});console.log('READY '+JSON.stringify({url:server.url.href,pid:process.pid}));`,
        )
        let readyResolve, readyReject
        const ready = new Promise((resolve, reject) => {
          readyResolve = resolve
          readyReject = reject
        })
        child = spawn(binary, ['server.ts'], {
          cwd: directory,
          env: { ...process.env, NODE_ENV: 'development' },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        child.on('error', readyReject)
        child.on('exit', (code, signal) =>
          readyReject(new Error(`Bun exited (${code},${signal})\n${logs}`)),
        )
        let pending = ''
        child.stdout.on('data', (chunk) => {
          logs += chunk
          pending += chunk
          let newline
          while ((newline = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, newline)
            pending = pending.slice(newline + 1)
            if (line.startsWith('READY ')) {
              try {
                readyResolve(JSON.parse(line.slice(6)))
              } catch (error) {
                readyReject(error)
              }
            }
          }
        })
        child.stderr.on('data', (chunk) => {
          logs += chunk
        })
        let timer
        const info = await Promise.race([
          ready,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Startup deadline\n${logs}`)),
              20000,
            )
          }),
        ]).finally(() => clearTimeout(timer))
        result.pid = info.pid
        result.revision = execFileSync(binary, ['--revision'], {
          encoding: 'utf8',
        }).trim()
        result.binarySha256 = createHash('sha256')
          .update(await readFile(binary))
          .digest('hex')
        context = await browser.newContext()
        await context.addInitScript(() => {
          globalThis.__pureGraphDocumentToken = crypto.randomUUID()
        })
        if (largePairMode) {
          await context.addInitScript(() => {
            const key = Symbol.for('bun:hmr')
            let callback
            Object.defineProperty(globalThis, key, {
              configurable: true,
              get() {
                return callback
              },
              set(original) {
                callback = function (...args) {
                  const record = (kind) =>
                    console.debug(
                      '__PURE_CALLBACK__' +
                        JSON.stringify({
                          kind,
                          id: args[1],
                          keys: Object.keys(args[0]),
                          time: performance.now(),
                          documentToken: globalThis.__pureGraphDocumentToken,
                        }),
                    )
                  record('start')
                  try {
                    return Reflect.apply(original, this, args)
                  } finally {
                    record('return')
                  }
                }
              },
            })
          })
        }
        const page = await context.newPage()
        const session = sourceMapMode ? await context.newCDPSession(page) : null
        const scripts = new Map()
        if (session) {
          session.on('Debugger.scriptParsed', (script) =>
            scripts.set(script.scriptId, script),
          )
          await session.send('Debugger.enable')
        }
        let phase = 'initial-A'
        let pairedWrite
        const assets = []
        page.on('load', () => {
          result.documentLoads++
        })
        page.on('console', (message) => {
          if (message.type() === 'error') {
            result.errors.push({ phase, type: 'console', text: message.text() })
          }
        })
        page.on('console', (message) => {
          if (message.text().startsWith('__PURE_CALLBACK__')) {
            ;(result.callbackEvents ??= []).push({
              ...JSON.parse(message.text().slice('__PURE_CALLBACK__'.length)),
              phase,
            })
          }
          if (message.text().startsWith('__PURE_LIFECYCLE__')) {
            ;(result.lifecycleEvents ??= []).push({
              phase,
              event: message.text().slice('__PURE_LIFECYCLE__'.length),
            })
          }
        })
        page.on('pageerror', (error) =>
          result.errors.push({ phase, type: 'pageerror', text: error.message }),
        )
        page.on('websocket', (socket) =>
          socket.on('framereceived', (event) => {
            const bytes = Buffer.from(event.payload)
            const sourceMapId = bytes
              .toString('utf8')
              .match(
                /sourceMappingURL=\/_bun\/client\/([a-f0-9]{16})\.js\.map/,
              )?.[1]
            result.websocketFrames.push({
              phase,
              bytes: bytes.length,
              ...(sourceMapId ? { sourceMapId } : {}),
              mentionedModules: mentions(bytes.toString('utf8')),
              base64: bytes.toString('base64'),
            })
            if (
              largePairMode &&
              phase === 'A-to-B' &&
              !pairedWrite &&
              bytes.toString('utf8').includes('self[Symbol.for("bun:hmr")]')
            ) {
              pairedWrite = writeFile(
                path.join(directory, 'graph.ts'),
                `import {value as label,shared} from './after.ts';export {shared};export const value=label+'-TWO';`,
              )
            }
          }),
        )
        page.on('response', (response) => {
          if (new URL(response.url()).pathname.endsWith('.js')) {
            const responsePhase = phase
            assets.push(
              response
                .text()
                .then(async (text) => {
                  const file = output.replace(
                    /\.json$/,
                    `-${name}-js${result.initialJavaScript.length}.txt`,
                  )
                  result.initialJavaScript.push({
                    phase: responsePhase,
                    url: response.url(),
                    mentionedModules: mentions(text),
                    file,
                  })
                  await writeFile(file, text)
                })
                .catch((error) =>
                  result.initialJavaScript.push({
                    phase: responsePhase,
                    error: String(error),
                  }),
                ),
            )
          }
        })
        const checkpoint = async (expected) => {
          await expect(page.locator('#app')).toHaveText(expected, {
            timeout: 15000,
          })
          assert.deepEqual(
            await (await fetch(new URL('/__info', info.url))).json(),
            { pid: info.pid },
          )
          await Promise.all(assets)
          result.steps.push({
            phase,
            text: expected,
            documentToken: await page.evaluate(
              () => globalThis.__pureGraphDocumentToken,
            ),
            documentLoads: result.documentLoads,
            errorCount: result.errors.length,
          })
          if (largePairMode) {
            assert.deepEqual(
              await page.evaluate(() => globalThis.__pureShared),
              { identity: true, initializations: 1 },
            )
          }
        }
        const checkAuthoredThrow = async () => {
          await session.send('Debugger.setPauseOnExceptions', { state: 'all' })
          let resumePromise
          const paused = new Promise((resolve) =>
            session.once('Debugger.paused', (event) => {
              resolve(event)
              resumePromise = session.send('Debugger.resume')
            }),
          )
          const evaluation = session.send('Runtime.evaluate', {
            expression: `try { globalThis.__throwCached() } catch(error) { error.message }`,
            returnByValue: true,
          })
          let pauseTimer
          const event = await Promise.race([
            paused,
            new Promise((_, reject) => {
              pauseTimer = setTimeout(
                () => reject(new Error('Expected authored exception pause')),
                15000,
              )
            }),
          ]).finally(() => clearTimeout(pauseTimer))
          await resumePromise
          const evaluated = await evaluation
          await session.send('Debugger.setPauseOnExceptions', { state: 'none' })
          assert.equal(evaluated.result.value, 'CACHED_CLOSURE_AUTHORED_THROW')
          const frame = event.callFrames[0],
            script = scripts.get(frame.location.scriptId)
          assert.ok(
            script?.sourceMapURL,
            'Throwing script must declare a source map',
          )
          const { scriptSource } = await session.send(
            'Debugger.getScriptSource',
            { scriptId: script.scriptId },
          )
          const mapUrl = script.sourceMapURL.startsWith('/')
            ? new URL(script.sourceMapURL, info.url).href
            : new URL(
                script.sourceMapURL,
                new URL(script.url || info.url, info.url),
              ).href
          assert.ok(!mapUrl.startsWith('data:'), 'Expected network source map')
          const response = await fetch(mapUrl)
          assert.equal(response.status, 200)
          const map = await response.json(),
            trace = AnyMap(map)
          const generated = {
            line: frame.location.lineNumber + 1,
            column: frame.location.columnNumber,
          }
          const traced = originalPositionFor(trace, generated)
          assert.ok(traced.source, 'Authored source is required')
          const tracedFile = traced.source.startsWith('file:')
            ? fileURLToPath(traced.source)
            : path.resolve(directory, traced.source)
          assert.equal(
            path.normalize(tracedFile),
            path.join(directory, 'cached-leaf.ts'),
          )
          assert.equal(traced.line, 3)
          assert.equal(traced.column, 2)
          assert.equal(
            sourceContentFor(trace, traced.source, true),
            authoredSource,
          )
          const snapshot = output.replace(/\.json$/, `-${name}-${phase}-throw`)
          await writeFile(snapshot + '.js', scriptSource)
          await writeFile(snapshot + '.js.map', JSON.stringify(map))
          ;(result.authoredThrows ??= []).push({
            phase,
            scriptUrl: script.url,
            sourceMapURL: script.sourceMapURL,
            mapUrl,
            generated,
            traced,
            sourceContentMatches: true,
            snapshot,
          })
        }
        await page.goto(info.url)
        await checkpoint('BEFORE')
        if (sourceMapMode) {
          await checkAuthoredThrow()
        }
        phase = 'A-to-B'
        await writeFile(
          path.join(directory, 'graph.ts'),
          sourceMapMode
            ? `export {value,authoredThrow} from './after.ts';`
            : largePairMode
              ? `import {value as label,shared} from './after.ts';export {shared};export const value=label+'-ONE';`
              : `export {value} from './after.ts';`,
        )
        await checkpoint(largePairMode ? 'AFTER-TWO' : 'AFTER')
        if (largePairMode) {
          assert.ok(
            pairedWrite,
            'Second public file write was triggered by first HMR frame',
          )
          await pairedWrite
          assert.equal(
            result.documentLoads,
            1,
            'Paired updates must retain the document',
          )
        }
        if (reloadWhileAfter) {
          phase = 'reload-B'
          await page.reload()
          await checkpoint('AFTER')
        }
        phase = 'B-to-A'
        await writeFile(
          path.join(directory, 'graph.ts'),
          sourceMapMode
            ? `export {value,authoredThrow} from './before.ts';`
            : largePairMode
              ? `export {value,shared} from './before.ts';`
              : `export {value} from './before.ts';`,
        )
        await checkpoint('BEFORE')
        if (sourceMapMode) {
          assert.equal(
            result.documentLoads,
            2,
            'Restoration must not fall back to another document reload',
          )
          await checkAuthoredThrow()
        }
        assert.deepEqual(result.errors, [], 'Unexpected browser errors')
        result.passed = true
        console.log(`PASS ${name}`)
      } catch (error) {
        result.error = error instanceof Error ? error.stack : String(error)
        console.log(`FAIL ${name}: ${String(error).split('\n')[0]}`)
      } finally {
        result.serverLog = logs
        try {
          await context?.close()
        } finally {
          if (child && child.exitCode === null && child.signalCode === null) {
            child.kill()
            await new Promise((resolve) => child.once('exit', resolve))
          }
          await rm(directory, { recursive: true, force: true })
        }
      }
      results.push(result)
      await writeFile(
        output,
        JSON.stringify(
          {
            platform: process.platform,
            node: process.version,
            sourceMapMode,
            largePairMode,
            passed: results.filter((result) => result.passed).length,
            cases: binaries.length * (sourceMapMode || largePairMode ? 1 : 2),
            results,
          },
          null,
          2,
        ) + '\n',
      )
    }
  }
} finally {
  await browser.close()
}
console.log(
  `RESULT ${results.filter((result) => result.passed).length}/${results.length}; ${output}`,
)
if (results.some((result) => !result.passed)) {
  process.exitCode = 1
}
