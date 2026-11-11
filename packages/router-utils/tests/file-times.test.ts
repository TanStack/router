/**
 * Tripwire of what the empty-read rule relies on of the filesystem it runs
 * on (`RawFactsCache.readChange`): an event that read a file empty and
 * waited in vain is not waited on again while the file's modification time
 * is the same. A save that truncates the file before writing it (an
 * in-place save) must therefore move the time, or stamp whole seconds (a
 * coarse clock, which the rule treats as unknown and always waits on).
 * Goes red on a filesystem where truncating an empty file keeps a time
 * finer than a second.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { fileModifiedAt } from '../src/compiler'

const dirs: Array<string> = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('truncating an empty file moves its modification time, or the clock is whole seconds', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tsr-file-times-'))
  dirs.push(dir)
  const file = path.join(dir, 'a.ts')
  writeFileSync(file, '')
  const before = await fileModifiedAt(file)
  // (a save comes a moment after the event that read the file empty)
  await new Promise((resolve) => setTimeout(resolve, 20))
  writeFileSync(file, '')
  const after = await fileModifiedAt(file)
  expect(before).not.toBeNull()
  expect(after !== before || before! % 1000 === 0).toBe(true)
})
