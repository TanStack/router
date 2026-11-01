import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./measure.mjs', import.meta.url))
const root = path.resolve(path.dirname(script), '../../..')

test('the benchmark measures declaration changes for implementation and contract edits', () => {
  const result = spawnSync(process.execPath, [script, '2', '1'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const output = `${result.stdout}${result.stderr}`
  assert.equal(result.error, undefined, output)
  assert.equal(result.status, 0, output)

  const implementation =
    /Implementation change: emit[^\n]*, (\d+) declarations changed/.exec(output)
  assert.ok(implementation, output)
  assert.equal(Number(implementation[1]), 0, output)

  const contract =
    /Contract change: generate \+ emit[^\n]*, (\d+) declarations changed/.exec(
      output,
    )
  assert.ok(contract, output)
  assert.ok(Number(contract[1]) > 0, output)
})
