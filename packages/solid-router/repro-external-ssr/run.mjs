// External-SSR hydration repro for the Matches loading-boundary rework.
// Server: renderToString(RouterProvider) after `await router.load()` — no
// $_TSR protocol. Client: `await router.load()` then hydrate(), then a
// post-hydration navigation to a route with an unresolved chunk.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { build } from 'vite'
import solid from '@solidjs/vite-plugin'
import { JSDOM, VirtualConsole } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))

const alias = {
  'solid-js/web': '@solidjs/web',
}

// ---- 1. Server bundle (SSR compile) ----
await build({
  configFile: false,
  logLevel: 'error',
  root: here,
  mode: 'development',
  plugins: [solid({ ssr: true, hot: false })],
  resolve: { alias },
  ssr: { noExternal: true },
  build: {
    ssr: join(here, 'entry-server.tsx'),
    outDir: join(here, 'out/server'),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
  },
})

const { render } = await import(
  pathToFileURL(join(here, 'out/server/entry-server.js')).href
)
const { appHtml, hydrationScript } = await render()
console.log('--- server HTML (first 400 chars):')
console.log(appHtml.slice(0, 400))

// ---- 2. Client bundle (DOM compile, single-file IIFE) ----
await build({
  configFile: false,
  logLevel: 'error',
  root: here,
  mode: 'development',
  // ssr: true is required on the client build too: it makes the compiled
  // output hydratable (claim server nodes instead of creating fresh ones).
  plugins: [solid({ ssr: true, hot: false })],
  resolve: { alias, conditions: ['browser', 'development', 'module', 'import'] },
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  build: {
    outDir: join(here, 'out/client'),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: join(here, 'entry-client.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'client.js',
        inlineDynamicImports: true,
      },
    },
  },
})
const clientBundle = readFileSync(join(here, 'out/client/client.js'), 'utf8')

// ---- 3. Hydrate in jsdom ----
const virtualLog = []
const virtualConsole = new VirtualConsole()
for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
  virtualConsole.on(level, (...args) => {
    virtualLog.push(`[${level}] ${args.map(String).join(' ')}`)
    console[level](...args)
  })
}
virtualConsole.on('jsdomError', (err) => {
  virtualLog.push(`[jsdomError] ${err.message}`)
})

const dom = new JSDOM(
  `<!DOCTYPE html><html><head><title>repro</title>${hydrationScript}</head>` +
    `<body><div id="root">${appHtml}</div></body></html>`,
  {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  },
)
for (const key of [
  'MessageChannel',
  'MessagePort',
  'queueMicrotask',
  // isRedirect probes `instanceof Response`; jsdom has no fetch globals.
  'Response',
  'Request',
  'Headers',
]) {
  if (dom.window[key] === undefined && globalThis[key] !== undefined) {
    dom.window[key] = globalThis[key]
  }
}

dom.window.eval(clientBundle)

const deadline = Date.now() + 10_000
while (!dom.window.__REPRO_DONE && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 25))
}

const results = dom.window.__REPRO_RESULTS ?? { fatal: 'no results recorded' }
console.log('--- results:')
console.log(JSON.stringify(results, null, 2))

const failures = []
if (results.fatal) failures.push(`fatal: ${results.fatal}`)
if ((results.hydrationErrors ?? []).length)
  failures.push('hydration produced console errors')
const unclaimed = virtualLog.filter((l) => l.includes('unclaimed'))
if (unclaimed.length)
  failures.push(`hydration left unclaimed server nodes: ${unclaimed[0]}`)
if (results.pendingFlashDuringHydrate === true)
  failures.push('pending UI flashed during hydration')
if (results.serverNodeReused !== true)
  failures.push('server-rendered node was NOT reused (mismatch re-render)')
if (results.registryPrimed !== true)
  failures.push('registry transfer did not prime the router (fell through)')
if (results.loaderRunsAfterHydrate !== 0)
  failures.push(
    `loader re-ran on the client during boot/hydration (${results.loaderRunsAfterHydrate} runs)`,
  )
if (results.loaderDataVisible !== true)
  failures.push('server loader data not visible after hydration')
if (results.pendingVisibleDuringNav !== true)
  failures.push(
    'REGRESSION: pending UI did not appear on post-hydration navigation',
  )
if (results.aboutVisibleAfterResolve !== true)
  failures.push('about content never appeared after chunk resolved')

console.log('--- verdict:')
if (failures.length) {
  for (const f of failures) console.log('FAIL:', f)
  process.exitCode = 1
} else {
  console.log('PASS: clean hydration, no pending flash, post-hydration nav shows pending UI')
}
