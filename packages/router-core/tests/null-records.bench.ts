import { afterAll, bench, describe, expect } from 'vitest'
import { hasKeys } from '../src/utils'

type RecordFactory = () => Record<string, unknown>

const dictionary: RecordFactory = () => Object.create(null)
const fast: RecordFactory = () => Object.setPrototypeOf({}, null)
const iterations = 128
const benchOptions = {
  time: 500,
  warmupTime: 100,
  throws: true,
}

if (process.env.TSR_LINK_PERF === '1') {
  for (const scenario of [
    { name: 'empty records', size: 0, layouts: 1 },
    { name: 'one field', size: 1, layouts: 1 },
    { name: 'eight fields', size: 8, layouts: 1 },
    { name: '64 fields', size: 64, layouts: 1 },
    { name: '256 fields', size: 256, layouts: 1 },
    { name: 'eight changing field names', size: 8, layouts: 32 },
  ]) {
    describe(`null records: ${scenario.name}`, () => {
      for (const variant of [
        {
          name: 'dictionary source / dictionary target',
          source: dictionary,
          target: dictionary,
        },
        {
          name: 'dictionary source / fast target',
          source: dictionary,
          target: fast,
        },
        {
          name: 'fast source / dictionary target',
          source: fast,
          target: dictionary,
        },
        { name: 'fast source / fast target', source: fast, target: fast },
      ]) {
        const sources = Array.from(
          { length: scenario.layouts },
          (_, layout) => {
            const source = variant.source()
            for (let index = 0; index < scenario.size; index++) {
              source[`field_${layout}_${index}`] = `value-${index}`
            }
            return source
          },
        )
        const records: Array<Record<string, unknown>> = []
        let nonempty = 0
        function run() {
          nonempty = 0
          for (let index = 0; index < iterations; index++) {
            const result = Object.assign(
              variant.target(),
              sources[index % sources.length],
            )
            records[index] = result
            if (hasKeys(result)) {
              nonempty++
            }
          }
        }
        function check() {
          expect(nonempty).toBe(scenario.size ? iterations : 0)
          for (let index = 0; index < records.length; index++) {
            expect(Object.getPrototypeOf(records[index])).toBeNull()
            expect(records[index]).toEqual(sources[index % sources.length])
          }
        }
        run()
        check()
        bench(variant.name, run, benchOptions)
        afterAll(check)
      }
    })
  }
}
