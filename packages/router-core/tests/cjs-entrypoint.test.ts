import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

describe('CommonJS entrypoint', () => {
  test('does not emit a circular dependency warning', () => {
    const entrypoint = resolve(process.cwd(), 'dist/cjs/index.cjs')
    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(entrypoint)})`],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '' },
      },
    )

    expect(result.status).toBe(0)
    expect(result.stderr).not.toContain('replaceRouteChunk')
  })
})
