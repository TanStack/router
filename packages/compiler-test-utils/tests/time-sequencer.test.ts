/**
 * Controls of the slow tiers' shard split (time-sequencer.ts): a file that
 * runs in no shard is a test CI never runs, one in two shards runs twice.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, expect, test } from 'vitest'
import { timeSequencer } from '../src/time-sequencer'
import type { TestSpecification, Vitest } from 'vitest/node'

const dir = mkdtempSync(path.join(os.tmpdir(), 'time-sequencer-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const times = {
  $comment: 'not a time',
  'tests/integration/a.test.ts': 60,
  'tests/integration/b.test.ts': 30,
  'tests/integration/c.test.ts': 30,
  'tests/integration/d.test.ts': 10,
  'tests/integration/e.test.ts': 5,
  'tests/integration/removed.test.ts': 100,
}
const timesFile = path.join(dir, 'file-times.json')
writeFileSync(timesFile, JSON.stringify(times))
const Sequencer = timeSequencer(pathToFileURL(timesFile))

const root = path.join(dir, 'package')
const files = ['a', 'b', 'c', 'd', 'e', 'new'].map(
  (name) =>
    ({
      moduleId: path.join(root, `tests/integration/${name}.test.ts`),
      project: { name: 'integration' },
    }) as TestSpecification,
)

async function shards(count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      new Sequencer({
        config: { root, shard: { index: i + 1, count } },
      } as unknown as Vitest).shard(files),
    ),
  )
}

const names = (shard: Array<TestSpecification>) =>
  shard.map((spec) => path.basename(spec.moduleId, '.test.ts')).sort()

test('every file runs in exactly one shard, a file without a time too', async () => {
  for (const count of [1, 2, 3, 4, 7]) {
    const all = (await shards(count)).flatMap(names).sort()
    expect(all).toEqual(['a', 'b', 'c', 'd', 'e', 'new'])
  }
})

test('the shards split by stored time, a file without one counting as the median', async () => {
  // longest first, each to the shard with the least so far: a 60; b 30;
  // c 30; new 30 (the median of 5 to 100) after b; d 10 and e 5 after c
  expect((await shards(3)).map(names)).toEqual([
    ['a'],
    ['b', 'new'],
    ['c', 'd', 'e'],
  ])
})
