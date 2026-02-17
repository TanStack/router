import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

import { extractViolationsFromLog, stripAnsi } from './violations.utils'

interface ErrorBuildResult {
  exitCode: number
  stdout: string
  stderr: string
  combined: string
}

async function readBuildResult(): Promise<ErrorBuildResult> {
  const resultPath = path.resolve(
    import.meta.dirname,
    '..',
    'error-build-result.json',
  )
  const mod = await import(resultPath, {
    with: { type: 'json' },
  } as any)
  return mod.default as ErrorBuildResult
}

// ---------------------------------------------------------------------------
// Error-mode E2E tests
//
// When `behavior: 'error'`, the import-protection plugin calls `this.error()`
// on the first violation it encounters, which causes the Vite/Rollup build to
// abort with a non-zero exit code.  These tests verify that behavior.
// ---------------------------------------------------------------------------

test('build fails with non-zero exit code in error mode', async () => {
  const result = await readBuildResult()
  expect(result.exitCode).not.toBe(0)
})

test('build output contains import-protection violation', async () => {
  const result = await readBuildResult()
  const text = stripAnsi(result.combined)

  // The error output must contain the structured violation header
  expect(text).toContain('[import-protection] Import denied in')
})

test('violation mentions the environment (client or ssr)', async () => {
  const result = await readBuildResult()
  const text = stripAnsi(result.combined)

  // At least one of the violation environments should appear
  const hasClient = text.includes('Import denied in client environment')
  const hasServer = text.includes('Import denied in server environment')
  expect(hasClient || hasServer).toBe(true)
})

test('violation includes importer and specifier details', async () => {
  const result = await readBuildResult()
  const text = stripAnsi(result.combined)

  expect(text).toContain('Importer:')
  expect(text).toContain('Import:')
})

test('violation includes denial reason', async () => {
  const result = await readBuildResult()
  const text = stripAnsi(result.combined)

  // Must include one of the denial reason types
  const hasFilePattern = text.includes('Denied by file pattern')
  const hasSpecifierPattern = text.includes('Denied by specifier pattern')
  const hasMarker = text.includes('Denied by marker')
  expect(hasFilePattern || hasSpecifierPattern || hasMarker).toBe(true)
})

test('violation includes trace information', async () => {
  const result = await readBuildResult()
  const text = stripAnsi(result.combined)

  expect(text).toContain('Trace:')
  // The trace should have at least one numbered step
  expect(text).toMatch(/\d+\.\s+\S+/)
})

test('violation is parseable by extractViolationsFromLog', async () => {
  const result = await readBuildResult()
  const violations = extractViolationsFromLog(result.combined)

  // In error mode the build aborts after the first violation, so we expect
  // exactly one violation to be logged.
  expect(violations.length).toBeGreaterThanOrEqual(1)

  const v = violations[0]!
  expect(v.envType).toMatch(/^(client|server)$/)
  expect(v.importer).toBeTruthy()
  expect(v.specifier).toBeTruthy()
  expect(v.type).toMatch(/^(file|specifier|marker)$/)
  expect(v.trace.length).toBeGreaterThanOrEqual(1)
})
