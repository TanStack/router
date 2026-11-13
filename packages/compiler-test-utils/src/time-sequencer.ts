/**
 * A Vitest sequencer (`test.sequence.sequencer`) that splits a sharded run
 * (`--shard=<i>/<n>`, the slow tiers' CI shards) by stored file times instead
 * of by path hash: longest file first, each to the shard with the least time
 * so far. Vitest's hash split gave CI shards of one tier 174 to 367 s.
 *
 * The times file maps a test file's path, relative to the Vitest root, to its
 * seconds in CI (one worker): `{ "tests/integration/foo.test.ts": 12.3 }`.
 * Read them from a green PR run's shard outputs (Vitest's line per file,
 * `✓ <project> tests/… (N tests) <ms>ms`). A file without a time counts as
 * the median; a listed file that no longer exists is ignored. Every shard
 * computes the same split from the same files, so each file runs in exactly
 * one shard. Within a shard the files run in Vitest's own order.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BaseSequencer } from 'vitest/node'
import type { TestSequencerConstructor, TestSpecification } from 'vitest/node'

export function timeSequencer(timesFile: URL): TestSequencerConstructor {
  const times = new Map(
    Object.entries(
      JSON.parse(readFileSync(timesFile, 'utf8')) as Record<string, unknown>,
    ).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )
  const sorted = [...times.values()].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1

  return class TimeSequencer extends BaseSequencer {
    override async shard(files: Array<TestSpecification>) {
      const { index, count } = this.ctx.config.shard!
      const weighed = files.map((spec) => {
        const file = path.relative(this.ctx.config.root, spec.moduleId)
        return {
          spec,
          key: `${spec.project.name} ${file}`,
          seconds: times.get(file) ?? median,
        }
      })
      weighed.sort((a, b) => b.seconds - a.seconds || (a.key < b.key ? -1 : 1))
      const loads = Array.from({ length: count }, () => 0)
      const mine: Array<TestSpecification> = []
      for (const { spec, seconds } of weighed) {
        const shard = loads.indexOf(Math.min(...loads))
        loads[shard]! += seconds
        if (shard === index - 1) {
          mine.push(spec)
        }
      }
      return mine
    }
  }
}
