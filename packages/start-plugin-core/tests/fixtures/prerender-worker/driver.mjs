import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const [entry, outputDir, scenario] = process.argv.slice(2)
assert.ok(entry)
assert.ok(outputDir)
assert.ok(scenario)
const { prerenderWithVite } = await import(pathToFileURL(entry).href)
const completed = []
const previousEnv = [
  process.env.TSS_PRERENDERING,
  process.env.TSS_CLIENT_OUTPUT_DIR,
]
process.env.PRERENDER_TEST_STARTUP_ERROR = String(scenario === 'startup-error')

const result = prerenderWithVite({
  builder: {
    environments: {
      ssr: {
        config: { configFile: join(import.meta.dirname, 'vite.config.mjs') },
      },
      client: { config: { build: { outDir: outputDir } } },
    },
  },
  startConfig: {
    pages:
      scenario === 'invalid-page'
        ? [{ path: 'https://outside.test/' }]
        : [{ path: '/' }, { path: '/about' }],
    router: { basepath: '' },
    spa: { enabled: false, prerender: { outputPath: '/_shell' } },
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 2,
      crawlLinks: false,
      filter: () => true,
      /** @param {{ page: { path: string }, html: string }} result */
      onSuccess: async ({ page, html }) => {
        await setTimeout(50)
        assert.match(html, /:complete:.*:true<\/body><\/html>/)
        completed.push(page.path)
      },
    },
  },
})

if (scenario === 'success') {
  await result
  assert.equal(completed.length, 2)
  for (const pathname of ['index.html', 'about/index.html']) {
    assert.match(
      await readFile(join(outputDir, pathname), 'utf8'),
      /:complete:/,
    )
  }
} else {
  await assert.rejects(
    result,
    scenario === 'invalid-page'
      ? /prerender page path must be relative/i
      : /Failed to start the Vite preview server/,
  )
}

assert.deepEqual(
  [process.env.TSS_PRERENDERING, process.env.TSS_CLIENT_OUTPUT_DIR],
  previousEnv,
)
await setTimeout(50)
console.log(`Caller completed: ${scenario}`)
