import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { watch } from 'node:fs'
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
import { setTimeout as batchInterval } from 'node:timers/promises'
const root =
  process.env.ROUTER_REPOSITORY_ROOT ??
  fileURLToPath(new URL('../../../', import.meta.url))
const binary = process.env.BUN_EXECUTABLE
assert.ok(binary, 'Set BUN_EXECUTABLE')
const output =
  process.env.PENDING_BATCH_OUTPUT ??
  path.join(
    root,
    `.cache/bun-dev-validation/results/pure-bun-pending-batches-${process.platform}.json`,
  )
await mkdir(path.dirname(output), { recursive: true })
const { chromium, expect } = createRequire(
  path.join(root, 'e2e/react-router/bun-basic-file-based/package.json'),
)('@playwright/test')
const directory = await realpath(
  await mkdtemp(path.join(tmpdir(), 'bun-pending-batches-')),
)
const controlDirectory = await realpath(
  await mkdtemp(path.join(tmpdir(), 'bun-pending-control-')),
)
const releaseFile = path.join(controlDirectory, 'release')
const blockThread = process.env.PENDING_BATCH_BLOCK !== '0'
const nativeSync = process.env.PENDING_BATCH_NATIVE_SYNC === '1'
const captureHmr = process.env.PENDING_BATCH_CAPTURE_HMR === '1'
const tracePath = process.env.BUN_WATCHER_TRACE
if (nativeSync) {
  assert.ok(tracePath, 'Native batch synchronization needs BUN_WATCHER_TRACE')
}
const result = {
  binary,
  blockThread,
  nativeSync,
  tracePath,
  binarySha256: createHash('sha256')
    .update(await readFile(binary))
    .digest('hex'),
  revision: execFileSync(binary, ['--revision'], { encoding: 'utf8' }).trim(),
  directory,
  controlDirectory,
  passed: false,
  writes: [],
  nativeBatches: [],
  ipc: [],
  browserErrors: [],
  documentLoads: 0,
}
let child,
  browser,
  context,
  logs = '',
  page
const assetCaptures = []
const snapshot = async () => ({
  text: await page.locator('#app').textContent(),
  documentToken: await page.evaluate(() => globalThis.documentToken),
  documentLoads: result.documentLoads,
})
const waitNativeBatch = async (name) => {
  const wanted = path.join(directory, name + '.ts').replaceAll('\\', '/')
  let observer, timer
  try {
    const event = await new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const text = await readFile(tracePath, 'utf8')
          for (const line of text
            .slice(0, text.lastIndexOf('\n') + 1)
            .split('\n')
            .filter(Boolean)) {
            const batch = JSON.parse(line)
            const entry = Object.entries(batch.files).find(
              ([filename]) => filename.replaceAll('\\', '/') === wanted,
            )
            if (entry) {
              resolve({
                name,
                timestamp: batch.timestamp,
                path: entry[0],
                ...entry[1],
              })
              return
            }
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            reject(error)
          }
        }
      }
      observer = watch(path.dirname(tracePath), (event, filename) => {
        if (String(filename) === path.basename(tracePath)) {
          void check()
        }
      })
      timer = setTimeout(
        () => reject(new Error('Native watcher batch deadline for ' + name)),
        15000,
      )
      void check()
    })
    result.nativeBatches.push(event)
  } finally {
    observer?.close()
    clearTimeout(timer)
  }
}
try {
  await writeFile(
    path.join(directory, 'index.html'),
    `<!doctype html><h1 id="app"></h1><script type="module" src="./main.ts"></script>`,
  )
  await writeFile(
    path.join(directory, 'main.ts'),
    `import {a} from './a.ts';import {b} from './b.ts';import {c} from './c.ts';document.querySelector('#app').textContent=[a,b,c].join('|');if(import.meta.hot)import.meta.hot.accept();`,
  )
  for (const name of ['a', 'b', 'c']) {
    await writeFile(
      path.join(directory, name + '.ts'),
      `export const ${name}='${name.toUpperCase()}0';\n`,
    )
  }
  await writeFile(
    path.join(directory, 'server.ts'),
    `
  import html from './index.html';import {existsSync} from 'node:fs';
  const releaseFile=${JSON.stringify(releaseFile)};
  process.on('message',message=>{
   if(message==='block'){
    process.send({phase:'blocked',time:Date.now()});
    const deadline=Date.now()+15000;
    while(!existsSync(releaseFile)){if(Date.now()>deadline){throw new Error('External release deadline exceeded')}}
    process.send({phase:'released',time:Date.now()});
   }
  });
  const server=Bun.serve({hostname:'127.0.0.1',port:0,development:{hmr:true},routes:{'/__info':()=>Response.json({pid:process.pid}),'/*':html}});
  process.send({phase:'ready',url:server.url.href,pid:process.pid});
 `,
  )
  let readyResolve, readyReject, blockedResolve, releasedResolve
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const blocked = new Promise((resolve) => {
    blockedResolve = resolve
  })
  const released = new Promise((resolve) => {
    releasedResolve = resolve
  })
  child = spawn(binary, ['server.ts'], {
    cwd: directory,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  child.on('error', readyReject)
  child.on('exit', (code, signal) =>
    readyReject(new Error(`Server exited ${code}/${signal}: ${logs}`)),
  )
  child.stdout.on('data', (chunk) => {
    logs += chunk
  })
  child.stderr.on('data', (chunk) => {
    logs += chunk
  })
  child.on('message', (message) => {
    result.ipc.push(message)
    if (message.phase === 'ready') {
      readyResolve(message)
    }
    if (message.phase === 'blocked') {
      blockedResolve(message)
    }
    if (message.phase === 'released') {
      releasedResolve(message)
    }
  })
  const deadline = async (promise, label) => {
    let timer
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} deadline: ${logs}`)),
          20000,
        )
      }),
    ]).finally(() => clearTimeout(timer))
  }
  const info = await deadline(ready, 'Startup')
  result.pid = info.pid
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  })
  context = await browser.newContext()
  await context.addInitScript(() => {
    globalThis.documentToken = crypto.randomUUID()
  })
  page = await context.newPage()
  if (captureHmr) {
    result.websocketFrames = []
    result.initialJavaScript = []
    const session = await context.newCDPSession(page)
    await session.send('Network.enable')
    session.on('Network.webSocketFrameReceived', (event) => {
      const { opcode, payloadData } = event.response
      const bytes = Buffer.from(payloadData, opcode === 2 ? 'base64' : 'utf8')
      const decoded = bytes.toString('utf8')
      const frame = {
        requestId: event.requestId,
        timestamp: event.timestamp,
        opcode,
        bytes: bytes.length,
        base64: bytes.toString('base64'),
      }
      result.websocketFrames.push(frame)
      if (decoded.includes('self[Symbol.for("bun:hmr")]')) {
        frame.file = output.replace(
          /\.json$/,
          `-hmr${result.websocketFrames.length}.txt`,
        )
        assetCaptures.push(writeFile(frame.file, decoded))
      }
    })
    page.on('response', (response) => {
      if (!new URL(response.url()).pathname.endsWith('.js')) {
        return
      }
      const asset = {
        url: response.url(),
        file: output.replace(
          /\.json$/,
          `-initial${result.initialJavaScript.length}.js`,
        ),
      }
      result.initialJavaScript.push(asset)
      assetCaptures.push(
        response
          .text()
          .then((text) => writeFile(asset.file, text))
          .catch((error) => {
            asset.error = String(error)
          }),
      )
    })
  }
  page.on('load', () => {
    result.documentLoads++
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      result.browserErrors.push({ type: 'console', text: message.text() })
    }
  })
  page.on('pageerror', (error) =>
    result.browserErrors.push({ type: 'pageerror', text: error.message }),
  )
  await page.goto(info.url)
  await expect(page.locator('#app')).toHaveText('A0|B0|C0')
  result.before = await snapshot()
  if (blockThread) {
    child.send('block')
    await deadline(blocked, 'IPC block')
  }
  for (const name of ['a', 'b', 'c']) {
    const started = Date.now(),
      contents = `export const ${name}='${name.toUpperCase()}1';\n`
    await writeFile(path.join(directory, name + '.ts'), contents)
    result.writes.push({ name, started, finished: Date.now(), contents })
    if (nativeSync) {
      await waitNativeBatch(name)
    } else {
      await batchInterval(150)
    }
  }
  if (blockThread) {
    await writeFile(releaseFile, 'release\n')
    await deadline(released, 'IPC release')
  }
  try {
    await expect(page.locator('#app')).toHaveText('A1|B1|C1', { timeout: 5000 })
  } finally {
    result.after = await snapshot()
  }
  assert.equal(
    result.after.documentToken,
    result.before.documentToken,
    'Updates must retain the document',
  )
  assert.equal(result.documentLoads, 1)
  assert.deepEqual(result.browserErrors, [])
  assert.deepEqual(await (await fetch(new URL('/__info', info.url))).json(), {
    pid: info.pid,
  })
  result.passed = true
} catch (error) {
  result.error = error.stack ?? String(error)
  result.moduleBytes = Object.fromEntries(
    await Promise.all(
      ['a', 'b', 'c'].map(async (name) => [
        name,
        await readFile(path.join(directory, name + '.ts'), 'utf8'),
      ]),
    ),
  )
  result.preservedFixture = true
} finally {
  await writeFile(releaseFile, 'cleanup release\n').catch(() => {})
  await Promise.all(assetCaptures)
  await context?.close()
  await browser?.close()
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
  }
  result.serverLog = logs
  if (result.passed) {
    await rm(directory, { recursive: true, force: true })
  }
  await rm(controlDirectory, { recursive: true, force: true })
  await writeFile(output, JSON.stringify(result, null, 2) + '\n')
}
console.log(
  JSON.stringify({
    passed: result.passed,
    before: result.before,
    after: result.after,
    writes: result.writes.map(({ name, started, finished }) => ({
      name,
      started,
      finished,
    })),
    error: result.error?.split('\n')[0],
    output,
  }),
)
if (!result.passed) {
  process.exitCode = 1
}
