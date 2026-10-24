import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root =
  process.env.ROUTER_REPOSITORY_ROOT ??
  fileURLToPath(new URL('../../../', import.meta.url))
process.env.ROUTER_REPOSITORY_ROOT = root
if (!process.env.BUN_EXECUTABLE) {
  throw new Error('Set BUN_EXECUTABLE to the native Bun candidate')
}
process.env.BUN_PLUGIN_PRELOAD ??= fileURLToPath(
  new URL('./helper-browser-preload.mjs', import.meta.url),
)
for (const [pkg, name, env, fallback] of [
  [
    'router-plugin',
    'unplugin',
    'UNPLUGIN_CANDIDATE_ENTRY',
    '.cache/upstream-drafts/unplugin/dist/index.mjs',
  ],
  [
    'router-generator',
    'jiti',
    'JITI_CANDIDATE_ENTRY',
    '.cache/jiti-helper-investigation/upstream/lib/jiti.mjs',
  ],
]) {
  const directory = path.join(root, 'packages', pkg, '.cache')
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, 'helper-browser-override.mjs'),
    `import { mock } from 'bun:test'\nimport { pathToFileURL } from 'node:url'\nimport path from 'node:path'\nconst entry = process.env[${JSON.stringify(env)}] ?? path.join(process.env.ROUTER_REPOSITORY_ROOT, ${JSON.stringify(fallback)})\nconst actual = await import(pathToFileURL(path.resolve(entry)).href)\nmock.module(${JSON.stringify(name)}, () => actual)\n`,
  )
}
const projectRequire = createRequire(
  path.join(root, 'e2e/react-router/bun-basic-file-based/package.json'),
)
const { chromium, expect } = projectRequire('@playwright/test')
const { startDevFixture } = await import(
  pathToFileURL(
    path.join(root, 'e2e/react-router/bun-basic-file-based/dev-fixture.ts'),
  ).href
)
const output =
  process.env.HELPER_BROWSER_OUTPUT ??
  path.join(
    root,
    `.cache/bun-dev-validation/results/helper-browser-${process.platform}.json`,
  )
const logFile = output.replace(/\.json$/, '.log')
await mkdir(path.dirname(output), { recursive: true })
const log = []
const say = (message) => {
  log.push(message)
  console.log(message)
}
const cases = ['js', 'mjs', 'cjs', 'json'].flatMap((ext) =>
  [1, 2].map((depth) => ({ ext, depth, dynamic: false })),
)
cases.push({ ext: 'mjs', depth: 2, dynamic: true })
const results = []
const configSource = (file, dynamic = false) =>
  file.endsWith('.cjs')
    ? `const config = require(${JSON.stringify(file)}); export default config\n`
    : dynamic
      ? `export default (await import(${JSON.stringify(file)})).default\n`
      : `import config from ${JSON.stringify(file)}; export default config\n`
const configValue = (included) => ({
  type: 'root',
  file: '__root.tsx',
  children: [
    { type: 'index', file: 'index.tsx' },
    { type: 'route', path: '/about', file: 'about.tsx' },
    {
      type: 'route',
      path: `/virtual-${included}`,
      file: `../virtual-pages/${included}.tsx`,
    },
  ],
})
const helperSource = (ext, included) =>
  ext === 'json'
    ? JSON.stringify(configValue(included))
    : ext === 'cjs'
      ? `module.exports = ${JSON.stringify(configValue(included))}\n`
      : `export default ${JSON.stringify(configValue(included))}\n`
const sha256 = async (filename) =>
  createHash('sha256')
    .update(await readFile(filename))
    .digest('hex')
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
})
try {
  for (const scenario of cases) {
    const name = `${scenario.ext}-depth${scenario.depth}${scenario.dynamic ? '-dynamic' : ''}`
    say(`START ${name}`)
    const result = {
      ...scenario,
      passed: false,
      steps: [],
      browserErrors: [],
      documentLoads: 0,
    }
    let native, context
    try {
      native = await startDevFixture({
        virtualConfigFile: true,
        virtualConfigHelperDepth: 1,
      })
      result.pid = native.pid
      result.versions = native.versions
      context = await browser.newContext()
      await context.addInitScript(() => {
        globalThis.__helperBrowserDocumentToken = crypto.randomUUID()
      })
      const page = await context.newPage()
      page.on('load', () => {
        result.documentLoads++
      })
      page.on('pageerror', (error) =>
        result.browserErrors.push({
          type: 'pageerror',
          message: error.message,
        }),
      )
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          !message.location().url.endsWith('/favicon.ico')
        ) {
          result.browserErrors.push({
            type: 'console',
            message: message.text(),
            location: message.location(),
          })
        }
      })
      const heading = page.getByRole('heading')
      const goHome = async () => {
        await page.getByRole('link', { name: 'Home', exact: true }).click()
        await expect(heading).toHaveText('HOME_NATIVE_DEV', { timeout: 15000 })
      }
      const checkpoint = async (phase, included) => {
        await expect
          .poll(
            async () => {
              native.assertAlive()
              const tree = await native.tree()
              return (
                tree.includes(`/virtual-${included}`) &&
                !tree.includes(
                  `/virtual-${included === 'after' ? 'before' : 'after'}`,
                )
              )
            },
            {
              timeout: 15000,
              message: `${name} ${phase}: automatic route-tree update`,
            },
          )
          .toBe(true)
        await page
          .getByRole('link', { name: `Virtual ${included}`, exact: true })
          .click()
        await expect(heading).toHaveText(`VIRTUAL_${included.toUpperCase()}`, {
          timeout: 15000,
        })
        native.assertAlive()
        assert.deepEqual(
          await (await fetch(new URL('/__native-info', native.url))).json(),
          { pid: native.pid },
        )
        result.steps.push({
          phase,
          route: `/virtual-${included}`,
          samePid: true,
          documentToken: await page.evaluate(
            () => globalThis.__helperBrowserDocumentToken,
          ),
          documentLoads: result.documentLoads,
          browserErrorCount: result.browserErrors.length,
        })
        await goHome()
      }
      await page.goto(native.url)
      await expect(heading).toHaveText('HOME_NATIVE_DEV', { timeout: 15000 })
      await checkpoint('ts-bootstrap', 'before')
      const helper = `config/browser-helper.${scenario.ext}`
      await native.save(helper, helperSource(scenario.ext, 'after'))
      if (scenario.depth === 2) {
        await native.save(
          'config/browser-bridge.ts',
          configSource(`./browser-helper.${scenario.ext}`, scenario.dynamic),
        )
      }
      await native.save(
        'virtual-routes.ts.next',
        configSource(
          scenario.depth === 2
            ? './config/browser-bridge.ts'
            : `./config/browser-helper.${scenario.ext}`,
        ),
      )
      await native.rename('virtual-routes.ts.next', 'virtual-routes.ts')
      await checkpoint('helper-graph-loaded', 'after')
      await native.save(helper, helperSource(scenario.ext, 'before'))
      await checkpoint('helper-in-place-edit', 'before')
      await native.save(`${helper}.next`, helperSource(scenario.ext, 'after'))
      await native.rename(`${helper}.next`, helper)
      await checkpoint('helper-atomic-replacement', 'after')
      assert.deepEqual(
        result.browserErrors,
        [],
        `${name}: unexpected browser errors`,
      )
      const serverErrors = native
        .logs()
        .split(/\r?\n/)
        .filter((line) => /^(?:error:|panic:|thread .* panicked)/i.test(line))
      assert.deepEqual(serverErrors, [], `${name}: unexpected server errors`)
      result.passed = true
      say(
        `PASS ${name}: browser navigation + automatic tree updates, in-place/atomic, same PID ${native.pid}, no browser errors`,
      )
    } catch (error) {
      result.error = error instanceof Error ? error.stack : String(error)
      result.serverLog = native?.logs().slice(-12000)
      say(`FAIL ${name}: ${String(error).split('\n')[0]}`)
    } finally {
      try {
        await context?.close()
      } finally {
        await native?.close()
      }
    }
    results.push(result)
    await writeFile(
      output,
      JSON.stringify(
        {
          platform: process.platform,
          node: process.version,
          passed: results.filter((result) => result.passed).length,
          cases: cases.length,
          results,
        },
        null,
        2,
      ) + '\n',
    )
    await writeFile(logFile, log.join('\n') + '\n')
  }
} finally {
  await browser.close()
}
const report = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  binary: process.env.BUN_EXECUTABLE,
  binarySha256: await sha256(process.env.BUN_EXECUTABLE),
  preload: process.env.BUN_PLUGIN_PRELOAD,
  passed: results.filter((result) => result.passed).length,
  cases: cases.length,
  results,
}
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
say(`RESULT ${report.passed}/${report.cases} PASS; evidence ${output}`)
await writeFile(logFile, log.join('\n') + '\n')
if (report.passed !== report.cases) {
  process.exitCode = 1
}
