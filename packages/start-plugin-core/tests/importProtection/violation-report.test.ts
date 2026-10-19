/**
 * Controls of the report adapter (`violation-report.ts`): it reads the
 * reports import protection formats by their documented sections, whatever
 * the header says, the numbering, quotes, spacing or boxing; it ignores a
 * bundler's plugin tag and the runtime access reports of dev mocks; and it
 * fails on a diagnostic that announces import protection without the
 * documented sections.
 */
import { describe, expect, test } from 'vitest'
import { formatViolation } from '../../src/import-protection/trace'
import {
  reportedViolations,
  suggestedDirections,
  violationReports,
  violationTexts,
} from './violation-report'
import type { ViolationInfo } from '../../src/import-protection/trace'

const violation: ViolationInfo = {
  env: 'client',
  envType: 'client',
  type: 'file',
  behavior: 'mock',
  pattern: '**/*.server.*',
  specifier: './secret.server',
  importer: '/project/src/b.ts',
  importerLoc: { line: 4, column: 27 },
  resolved: '/project/src/secret.server.ts',
  trace: [
    { file: '/project/src/entry.ts', specifier: './a', line: 2, column: 1 },
    { file: '/project/src/a.ts', specifier: './b', line: 3, column: 1 },
    {
      file: '/project/src/b.ts',
      specifier: './secret.server',
      line: 4,
      column: 27,
    },
  ],
  snippet: {
    lines: [
      '    2 | // helper',
      '    3 | export const one = 1',
      '  > 4 | export const leak = () => secret()',
      '      |                           ^',
    ],
    highlightLine: 4,
    location: '/project/src/b.ts:4:27',
  },
}

const report = formatViolation(violation, '/project')

const parsed = {
  environment: 'client',
  importer: 'src/b.ts:4:27',
  specifier: './secret.server',
  trace: [
    { at: 'src/entry.ts:2:1', entry: true, imports: './a' },
    { at: 'src/a.ts:3:1', entry: false, imports: './b' },
    { at: 'src/b.ts:4:27', entry: false, imports: './secret.server' },
  ],
  code: {
    line: 4,
    pointsAt: 'secret()',
    shows: [
      '// helper',
      'export const one = 1',
      'export const leak = () => secret()',
    ],
    location: 'src/b.ts:4:27',
  },
}

describe('the report adapter', () => {
  test("reads a report's sections", () => {
    expect(violationReports(report)).toEqual([
      { ...parsed, text: expect.stringContaining('Importer:') },
    ])
    expect(reportedViolations(report)).toEqual([
      { environment: 'client', importer: 'src/b.ts:4:27' },
    ])
    expect(violationTexts(report)).toEqual([expect.stringContaining('Code:')])
  })

  test('reads each report of a log, in order, with the entries around them', () => {
    const server = formatViolation(
      {
        ...violation,
        env: 'ssr',
        envType: 'server',
        importer: '/project/src/s.ts',
      },
      '/project',
    )
    expect(
      reportedViolations([
        'info: vite dev server started',
        `warn: ${report}`,
        'warn: a warning of another plugin',
        `warn: ${server}`,
      ]),
    ).toEqual([
      { environment: 'client', importer: 'src/b.ts:4:27' },
      { environment: 'server', importer: 'src/s.ts:4:27' },
    ])
  })

  test.each([
    {
      name: 'another header',
      text: report.replace(
        'Import denied in client environment',
        'Blocked import in the client environment',
      ),
    },
    {
      name: 'a two-line header',
      text: report.replace(
        '[import-protection] Import denied in client environment',
        '[import-protection] Import denied\nThe client environment cannot import this module',
      ),
    },
    {
      name: 'no blank line after the header',
      text: report.replace(/environment\n\n/, 'environment\n'),
    },
    {
      name: 'other indentation and trace numbering',
      text: report
        .replace(/^ {4}(\d+)\. /gm, '$1) ')
        .replace(/^(?=.)/gm, '    '),
    },
    {
      name: 'single quotes',
      text: report.replace(/"/g, "'"),
    },
    {
      name: "a bundler's plugin tag before it",
      text: `[plugin tanstack-start-core:import-protection] ${report}`,
    },
    {
      name: "a Vite build error's plugin tag and error class before it",
      text: `[plugin tanstack-start-core:import-protection]\nRolldownError: ${report}`,
    },
    {
      name: "a dev server log's level before it",
      text: `warn: ${report}`,
    },
    {
      name: 'Rsbuild boxing',
      text: report
        .split('\n')
        .map((line) => `  │ ${line}`)
        .join('\n'),
    },
    {
      name: 'ANSI colours',
      text: report.replace('Importer:', '\u001b[33mImporter:\u001b[39m'),
    },
  ])('reads the same sections with $name', ({ text }) => {
    expect(violationReports(text)).toEqual([
      { ...parsed, text: expect.any(String) },
    ])
  })

  test('reads two reports of one text, with or without a blank line between them', () => {
    const second = formatViolation(
      { ...violation, importer: '/project/src/c.ts' },
      '/project',
    )
    for (const text of [
      `${report}${second}`,
      `${report.trim()}\n${second.trim()}`,
    ]) {
      expect(reportedViolations(text)).toEqual([
        { environment: 'client', importer: 'src/b.ts:4:27' },
        { environment: 'client', importer: 'src/c.ts:4:27' },
      ])
    }
  })

  test('reads a report without a trace or a code frame', () => {
    const bare = formatViolation(
      { ...violation, importerLoc: undefined, trace: [], snippet: undefined },
      '/project',
    )
    expect(violationReports(bare)).toEqual([
      {
        environment: 'client',
        importer: 'src/b.ts',
        specifier: './secret.server',
        trace: [],
        code: undefined,
        text: expect.any(String),
      },
    ])
  })

  test('ignores the runtime access report of a dev mock', () => {
    const access = `[import-protection] Mocked import used in dev client

Denied import: "./secret.server"
Importer: src/b.ts
Access: secret() (call)

Trace:
  1. src/entry.ts

Fix: ...`
    expect(reportedViolations([access, report])).toEqual([
      { environment: 'client', importer: 'src/b.ts:4:27' },
    ])
  })

  test.each([
    {
      name: 'without the Importer section',
      text: report.replace('Importer:', 'From:'),
    },
    {
      name: 'without the Import section',
      text: report.replace(/^ {2}Import:.*$/m, ''),
    },
    {
      name: 'whose header names no environment type',
      text: report.replace('client environment', 'the browser'),
    },
    {
      name: 'whose header names both environment types',
      text: report.replace(
        'client environment',
        'client environment (not the server)',
      ),
    },
  ])('fails on an import-protection diagnostic $name', ({ text }) => {
    expect(() => violationReports(text)).toThrow(/import-protection/)
  })

  test('a code frame without a highlighted line or caret fails', () => {
    expect(() =>
      violationReports(report.replace('  > 4 |', '    4 |')),
    ).toThrow(/caret/)
  })
})

describe('suggestedDirections', () => {
  test.each([
    {
      text: 'Wrap it in createServerFn().handler(...) or createIsomorphicFn()',
      directions: ['server'],
    },
    { text: 'or createServerOnlyFn(() => ...)', directions: ['server'] },
    { text: 'Render it in <ClientOnly>', directions: ['client'] },
    { text: 'use createClientOnlyFn', directions: ['client'] },
    { text: 'createIsomorphicFn() only', directions: [] },
    {
      text: 'createServerFn or createClientOnlyFn',
      directions: ['server', 'client'],
    },
    // Whole names only.
    { text: 'myCreateServerFnHelper', directions: [] },
  ])('$text: $directions', ({ text, directions }) => {
    expect(suggestedDirections(text)).toEqual(directions)
  })
})
