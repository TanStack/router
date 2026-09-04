import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify, parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const execute = promisify(execFile)
if (process.argv[2] === '--worker') {
  const [root, bundle, mode, depth, iterationsText] = process.argv.slice(3)
  const require = createRequire(path.join(root, 'package.json'))
  const { chromium } = require('@playwright/test')
  const source = await fs.readFile(bundle)
  const server = createServer((request, response) => {
    response.setHeader(
      'Content-Type',
      request.url === '/app.mjs' ? 'text/javascript' : 'text/html',
    )
    response.end(
      request.url === '/app.mjs'
        ? source
        : '<!doctype html><html><body></body></html>',
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const result = await page.evaluate(
      async ({ mode, depth, iterations }) => {
        const { createBenchmark } = await import('/app.mjs')
        const fixture = await createBenchmark(mode, depth)
        const drain = () => new Promise((resolve) => setTimeout(resolve, 0))
        await fixture.run(iterations * 3)
        await drain()
        fixture.verify()
        const samples = []
        for (let sample = 0; sample < 3; sample++) {
          const start = performance.now()
          await fixture.run(iterations)
          await drain()
          samples.push({
            wallUs: ((performance.now() - start) * 1000) / iterations,
          })
          fixture.verify()
        }
        fixture.dispose()
        return { samples }
      },
      { mode, depth: Number(depth), iterations: Number(iterationsText) },
    )
    if (errors.length) {
      throw new Error(errors.join('\n'))
    }
    process.stdout.write(
      JSON.stringify({ ...result, browser: browser.version() }),
    )
  } finally {
    await browser.close()
    server.close()
  }
} else {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      candidate: { type: 'string' },
      output: { type: 'string' },
      cases: { type: 'string', default: 'eager:2,lazy:8' },
      pairs: { type: 'string', default: '12' },
      iterations: { type: 'string', default: '3000' },
      control: { type: 'boolean', default: false },
    },
  })
  if (!values.base || !values.candidate || !values.output) {
    throw new Error('Required: --base, --candidate, --output')
  }
  const base = path.resolve(values.base),
    candidate = path.resolve(values.candidate),
    output = path.resolve(values.output)
  await fs.mkdir(output, { recursive: true })
  const require = createRequire(
    path.join(candidate, 'packages/router-core/package.json'),
  )
  const { build } = require('esbuild')
  for (const [label, root] of [
    ['base', base],
    ['candidate', candidate],
  ]) {
    await build({
      entryPoints: [path.join(root, 'benchmarks/client-nav/ready-routes.tsx')],
      outfile: path.join(output, `${label}.mjs`),
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      alias: {
        '@tanstack/react-router': path.join(
          root,
          'packages/react-router/src/index.tsx',
        ),
        '@tanstack/router-core': path.join(
          root,
          'packages/router-core/src/index.ts',
        ),
        '@tanstack/router-core/isServer': path.join(
          root,
          'packages/router-core/src/isServer/client.ts',
        ),
        '@tanstack/router-core/scroll-restoration-script': path.join(
          root,
          'packages/router-core/src/scroll-restoration-script/client.ts',
        ),
        '@tanstack/history': path.join(root, 'packages/history/src/index.ts'),
      },
      define: { 'process.env.NODE_ENV': '"production"' },
    })
  }
  if (values.control) {
    await fs.copyFile(
      path.join(output, 'base.mjs'),
      path.join(output, 'candidate.mjs'),
    )
  }
  const results = []
  for (const spec of values.cases.split(',')) {
    const [mode, depthText] = spec.split(':'),
      depth = Number(depthText)
    const pairs = []
    for (let pair = 0; pair < Number(values.pairs); pair++) {
      const result = {}
      for (const label of pair % 2
        ? ['candidate', 'base']
        : ['base', 'candidate']) {
        const { stdout } = await execute(
          process.execPath,
          [
            fileURLToPath(import.meta.url),
            '--worker',
            candidate,
            path.join(output, `${label}.mjs`),
            mode,
            String(depth),
            values.iterations,
          ],
          { maxBuffer: 1024 * 1024, timeout: 120000 },
        )
        result[label] = JSON.parse(stdout)
      }
      pairs.push(result)
      await fs.writeFile(
        path.join(output, 'samples.json'),
        JSON.stringify(
          {
            base,
            candidate,
            control: values.control,
            results: [
              ...results,
              { mode, depth, iterations: Number(values.iterations), pairs },
            ],
          },
          null,
          2,
        ),
      )
    }
    results.push({ mode, depth, iterations: Number(values.iterations), pairs })
    process.stdout.write(
      `Completed Chromium ${mode}/${depth}: ${pairs.length} fresh-browser pairs\n`,
    )
  }
}
