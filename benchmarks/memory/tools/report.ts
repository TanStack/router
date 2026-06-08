#!/usr/bin/env node

import path from 'node:path'
import {
  benchmarkName,
  getGitInfo,
  getProjectRoot,
  printScenarioResult,
  readScenarioResults,
  schemaVersion,
  toBenchmarkAction,
  writeJson,
} from './result-utils.ts'

const projectRoot = getProjectRoot()
const results = readScenarioResults()

if (results.length === 0) {
  throw new Error('No memory benchmark scenario results found')
}

const generatedAt = new Date().toISOString()
const git = getGitInfo()
const current = {
  schemaVersion,
  benchmarkName,
  generatedAt,
  sha: git.sha,
  status: {
    state: 'success',
    command: 'pnpm nx run @benchmarks/memory:report',
    git,
  },
  metrics: results,
}

writeJson(path.join(projectRoot, 'results', 'current.json'), current)
writeJson(
  path.join(projectRoot, 'results', 'benchmark-action.json'),
  toBenchmarkAction(results),
)

process.stdout.write('Memory Benchmarks\n')
for (const result of results) {
  printScenarioResult(result)
}
