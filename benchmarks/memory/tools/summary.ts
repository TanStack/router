#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { printScenarioResult, readScenarioResults } from './result-utils.ts'

const { values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: false,
  strict: false,
  options: {
    scope: { type: 'string' },
  },
})

const scope = values.scope
const results = readScenarioResults().filter((result) => {
  return !scope || result.id === scope || result.id.startsWith(`${scope}.`)
})

if (results.length === 0) {
  process.stdout.write(
    scope
      ? `No memory benchmark results found for ${scope}.\n`
      : 'No memory benchmark results found.\n',
  )
  process.exit(0)
}

process.stdout.write('Memory Benchmarks\n')
for (const result of results) {
  printScenarioResult(result)
}
