import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

test('prerender crawling keeps network requests and output files inside their boundaries', async (t) => {
  // Keep external package resolution available to the built SSR entry, while
  // excluding these temporary build artifacts from the app type check.
  const temporary = await mkdtemp(
    join(process.cwd(), 'node_modules/.prerender-crawl-'),
  )
  const outDir = join(temporary, 'output')
  const requests: Array<string | undefined> = []
  const external = createServer((request, response) => {
    requests.push(request.url)
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html>external-crawl-content</html>')
  })

  try {
    await new Promise<void>((resolve, reject) => {
      external.once('error', reject)
      external.listen(0, '127.0.0.1', resolve)
    })
    const address = external.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected a listening HTTP server')
    }
    const origin = `http://127.0.0.1:${address.port}`
    const build = await promisify(execFile)('pnpm', ['build:vite'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_DIST_DIR: outDir,
        E2E_PRERENDER_CRAWL_ORIGIN: origin,
      },
      timeout: 100_000,
      maxBuffer: 10 * 1024 * 1024,
    })

    t.diagnostic(build.stdout + build.stderr)
    const clientDir = join(outDir, 'client')
    const seed = await readFile(
      join(clientDir, 'crawl-boundaries/seed/index.html'),
      'utf8',
    )
    assert.ok(seed.includes(`/../../crawl-boundaries/escaped`))
    assert.ok(seed.includes(`//127.0.0.1:${address.port}/external`))
    assert.ok(seed.includes(`/%2F%2F127.0.0.1:${address.port}/encoded`))
    const safe = await readFile(
      join(clientDir, 'crawl-boundaries/safe/index.html'),
      'utf8',
    )
    assert.ok(safe.includes('crawl-boundaries:safe'))
    assert.deepEqual(requests, [])

    const htmlFiles = (await readdir(temporary, { recursive: true })).filter(
      (file) => file.endsWith('.html'),
    )
    assert.ok(htmlFiles.length >= 2)
    for (const file of htmlFiles) {
      assert.match(file.split('\\').join('/'), /^output\/client\//)
      const html = await readFile(join(temporary, file), 'utf8')
      assert.ok(!html.includes('external-crawl-content'))
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      external.close((error) => (error ? reject(error) : resolve())),
    )
    await rm(temporary, { recursive: true, force: true })
  }
})
