import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'

// Exercise the public production build once, rather than rebuilding in every
// browser/application mode. Both cases share one crawler invocation.
test('prerender crawling keeps network requests and output files inside their boundaries', async () => {
  test.skip(
    (process.env.E2E_TOOLCHAIN ?? 'vite') !== 'vite' ||
      (process.env.MODE ?? 'ssr') !== 'ssr',
    'This test runs its own Vite prerender build',
  )
  test.setTimeout(120_000)
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

    await test.info().attach('prerender-build', {
      body: build.stdout + build.stderr,
      contentType: 'text/plain',
    })
    const clientDir = join(outDir, 'client')
    const seed = await readFile(
      join(clientDir, 'crawl-boundaries/seed/index.html'),
      'utf8',
    )
    expect(seed).toContain(`/../../crawl-boundaries/escaped`)
    expect(seed).toContain(`//127.0.0.1:${address.port}/external`)
    expect(seed).toContain(`/%2F%2F127.0.0.1:${address.port}/encoded`)
    expect(
      await readFile(
        join(clientDir, 'crawl-boundaries/safe/index.html'),
        'utf8',
      ),
    ).toContain('crawl-boundaries:safe')
    expect(requests).toEqual([])

    const htmlFiles = (await readdir(temporary, { recursive: true })).filter(
      (file) => file.endsWith('.html'),
    )
    expect(htmlFiles.length).toBeGreaterThanOrEqual(2)
    for (const file of htmlFiles) {
      expect(file.split('\\').join('/')).toMatch(/^output\/client\//)
      expect(await readFile(join(temporary, file), 'utf8')).not.toContain(
        'external-crawl-content',
      )
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      external.close((error) => (error ? reject(error) : resolve())),
    )
    await rm(temporary, { recursive: true, force: true })
  }
})
