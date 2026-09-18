import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('namespace env-only function bodies are excluded from the opposite build', async () => {
  const outDir = process.env.E2E_DIST_DIR ?? 'dist'

  for (const [environment, included, excluded] of [
    ['client', 'NAMESPACE_CLIENT_ONLY_BODY', 'NAMESPACE_SERVER_ONLY_BODY'],
    ['server', 'NAMESPACE_SERVER_ONLY_BODY', 'NAMESPACE_CLIENT_ONLY_BODY'],
  ] as const) {
    const directory = join(outDir, environment)
    const files = (await readdir(directory, { recursive: true })).filter(
      (file) => /\.[cm]?js$/.test(file),
    )
    expect(files.length).toBeGreaterThan(0)
    const code = (
      await Promise.all(
        files.map((file) => readFile(join(directory, file), 'utf8')),
      )
    ).join('\n')

    expect(code).toContain(included)
    expect(code).not.toContain(excluded)
  }
})
