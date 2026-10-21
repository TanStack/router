/**
 * Controls of the report reader (`violation-report.ts`) on fixed report
 * texts: it reads a report by its content (SPEC J6.5), whatever the labels,
 * the order of the sections, the numbering, quotes, entry marker, spacing
 * or boxing (J6.12, §5.7; ruling 2026-10-21 R10), on every channel's text
 * (a log line, a bundler error with its plugin tag, an Rsbuild box, the
 * console); it ignores other diagnostics and the runtime access reports of
 * dev mocks; and it fails on a diagnostic that announces import protection
 * but whose importer, specifier or environment type it cannot read.
 *
 * The texts are fixed samples written here, not produced by the
 * implementation: today's layout (`guide/import-protection.md`, "Reading
 * Violation Traces"), and two other layouts a correct compiler may print
 * (the shapes of the R5 v2 and R10 variants of
 * `validation/COUPLING/variants`: other labels and separators, `#n` or
 * `[n/m]` steps, another entry marker or none, the chain printed from the
 * importer back to the entry, the sections in another order).
 */
import { describe, expect, test } from 'vitest'
import {
  expectReportFrame,
  expectViolationsAt,
  inEnvironment,
  locatedImporters,
  reportedViolations,
  suggestedDirections,
  violationReports,
  violationTexts,
} from './violation-report'
import type { ExpectedViolation } from './violation-report'

/** What a sample report says (the content of SPEC J6.5). */
interface Sample {
  environment: 'client' | 'server'
  rule: string
  importer: string
  location?: { line: number; column: number }
  specifier: string
  resolved?: string
  /** From the entry to the importer: file, location, specifier it imports. */
  trace: Array<{ file: string; at?: string; imports?: string }>
  frame?: Array<string>
  suggestions: Array<string>
}

const sample: Sample = {
  environment: 'client',
  rule: '**/*.server.*',
  importer: 'src/b.ts',
  location: { line: 4, column: 27 },
  specifier: './secret.server',
  resolved: 'src/secret.server.ts',
  trace: [
    { file: 'src/entry.ts', at: '2:1', imports: './a' },
    { file: 'src/a.ts', at: '3:1', imports: './b' },
    { file: 'src/b.ts', at: '4:27', imports: './secret.server' },
  ],
  frame: [
    '    2 | // helper',
    '    3 | export const one = 1',
    '  > 4 | export const leak = () => secret()',
    '      |                           ^',
  ],
  suggestions: [
    'Use createServerFn().handler(() => ...) to keep the logic on the server',
    'Move the server-only import out of this file into a separate .server.ts module',
  ],
}

type Layout = 'today' | 'labels' | 'reordered'

const at = (sample: Sample) =>
  sample.location
    ? `${sample.importer}:${sample.location.line}:${sample.location.column}`
    : sample.importer

const stepAt = (step: Sample['trace'][number]) =>
  step.at ? `${step.file}:${step.at}` : step.file

/** `sample` printed in one of three layouts. */
function print(layout: Layout, sample: Sample): string {
  const lines: Array<string> = ['']
  if (layout === 'today') {
    lines.push(
      `[import-protection] Import denied in ${sample.environment} environment`,
      '',
      `  Denied by file pattern: ${sample.rule}`,
      `  Importer: ${at(sample)}`,
      `  Import: "${sample.specifier}"`,
      ...(sample.resolved ? [`  Resolved: ${sample.resolved}`] : []),
    )
    if (sample.trace.length > 0) {
      lines.push('', '  Trace:')
      sample.trace.forEach((step, index) =>
        lines.push(
          `    ${index + 1}. ${stepAt(step)}${index === 0 ? ' (entry)' : ''}${step.imports ? ` (import "${step.imports}")` : ''}`,
        ),
      )
    }
    if (sample.frame) {
      lines.push('', '  Code:', ...sample.frame, '', `  ${at(sample)}`)
    }
    lines.push(
      '',
      '  Suggestions:',
      ...sample.suggestions.map((s) => `    - ${s}`),
    )
  } else if (layout === 'labels') {
    lines.push(
      `Import protection: this import is not allowed in the ${sample.environment} environment`,
      '',
      `  Denied by: file rule ${sample.rule}`,
      `  Importer -> ${at(sample)}`,
      `  Import -> '${sample.specifier}'`,
      ...(sample.resolved ? [`  Resolved -> ${sample.resolved}`] : []),
    )
    if (sample.trace.length > 0) {
      lines.push('', '  Trace (entry first):')
      sample.trace.forEach((step, index) =>
        lines.push(
          `    #${index + 1} ${stepAt(step)}${index === 0 ? ' [entry]' : ''}${step.imports ? ` imports '${step.imports}'` : ''}`,
        ),
      )
    }
    if (sample.frame) {
      lines.push(
        '',
        '  Code at the import site:',
        ...sample.frame,
        '',
        `  ${at(sample)}`,
      )
    }
    lines.push(
      '',
      '  Suggestions to fix it:',
      ...sample.suggestions.map((s) => `    * ${s}`),
    )
  } else {
    lines.push(
      `[import-protection] Import denied in ${sample.environment} environment`,
      `  Denied by file pattern: ${sample.rule}`,
    )
    if (sample.frame) {
      lines.push('', '  Code:', ...sample.frame, '', `  ${at(sample)}`)
    }
    lines.push(
      '',
      '  Suggestions:',
      ...sample.suggestions.map((s) => `    - ${s}`),
    )
    if (sample.trace.length > 0) {
      lines.push('', '  Trace (importer first, entry last):')
      const reversed = [...sample.trace].reverse()
      reversed.forEach((step, index) =>
        lines.push(
          `    [${index + 1}/${reversed.length}] ${stepAt(step)}${step.imports ? ` from "${step.imports}"` : ''}`,
        ),
      )
    }
    lines.push(
      '',
      `  Importer: ${at(sample)}`,
      `  Import: "${sample.specifier}"`,
      ...(sample.resolved ? [`  Resolved: ${sample.resolved}`] : []),
    )
  }
  lines.push('')
  return lines.join('\n')
}

const layouts: Array<Layout> = ['today', 'labels', 'reordered']

/** What the reader reads of `sample`. */
const read = {
  environment: 'client',
  importer: 'src/b.ts:4:27',
  specifier: './secret.server',
  resolved: 'src/secret.server.ts',
  trace: [
    { at: 'src/entry.ts:2:1', imports: './a' },
    { at: 'src/a.ts:3:1', imports: './b' },
    { at: 'src/b.ts:4:27', imports: './secret.server' },
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
  suggestions: sample.suggestions,
}

describe.each(layouts)('the reader, %s layout', (layout) => {
  const report = print(layout, sample)

  test('reads the content of a report', () => {
    expect(violationReports(report)).toEqual([
      { ...read, text: expect.stringContaining('src/b.ts:4:27') },
    ])
    expect(reportedViolations(report)).toEqual([
      { environment: 'client', importer: 'src/b.ts:4:27' },
    ])
    expect(violationTexts(report)).toEqual([
      expect.stringContaining('secret()'),
    ])
  })

  test('reads each report of a log, in order, among other entries', () => {
    const server = print(layout, {
      ...sample,
      environment: 'server',
      importer: 'src/s.ts',
    })
    expect(
      reportedViolations([
        'info: vite dev server started',
        `warn: ${report}`,
        'warn: a warning of another plugin about src/other.ts',
        `warn: ${server}`,
      ]),
    ).toEqual([
      { environment: 'client', importer: 'src/b.ts:4:27' },
      { environment: 'server', importer: 'src/s.ts:4:27' },
    ])
    expect(
      reportedViolations(inEnvironment([report, server], 'server')),
    ).toEqual([{ environment: 'server', importer: 'src/s.ts:4:27' }])
  })

  test.each([
    {
      name: 'another header wording',
      text: report.replace(
        /^.*\b(?:denied|not allowed)\b.*$/m,
        'Blocked import in the client environment',
      ),
    },
    {
      name: 'a header naming both environment types, one as the environment',
      text: report.replace(
        /^.*\b(?:denied|not allowed)\b.*$/m,
        'The client environment cannot import server code',
      ),
    },
    {
      name: 'a two-line header',
      text: report.replace(
        /^.*\b(?:denied|not allowed)\b.*$/m,
        '[import-protection] Import denied\nThe client environment cannot import this module',
      ),
    },
    {
      name: 'no blank lines',
      text: report.replace(/\n\n+/g, '\n'),
    },
    {
      name: 'the whole text indented and other numbering',
      text: report
        .replace(/^ {4}(?:\d+\.|#\d+|\[\d+\/\d+\]) /gm, '    • ')
        .replace(/^(?=.)/gm, '    '),
    },
    {
      name: 'other quotes',
      text: report.replace(/["']/g, '`'),
    },
    {
      name: 'other labels',
      text: report
        .replace(/^(\s*)Importer\b/m, '$1From file')
        .replace(/^(\s*)Import\b(?!er)/m, '$1Specifier')
        .replace(/^(\s*)Resolved\b/m, '$1Target'),
    },
    {
      name: 'absolute paths under the root',
      text: report.replace(/\bsrc\//g, '/project/src/'),
      root: '/project',
    },
    {
      name: "a bundler's plugin tag before it",
      text: `[plugin tanstack-start-core:import-protection] ${report.trimStart()}`,
    },
    {
      name: "a Vite build error's plugin tag and error class before it",
      text: `[plugin tanstack-start-core:import-protection]\nRolldownError: ${report.trimStart()}`,
    },
    {
      name: "a dev server log's level before it",
      text: `warn: ${report.trimStart()}`,
    },
    {
      name: 'Rsbuild boxing',
      text: `  × Module build failed:\n${report
        .split('\n')
        .map((line) => `  │ ${line}`)
        .join('\n')}`,
    },
    {
      name: 'ANSI colours',
      text: report.replace(
        'src/b.ts:4:27',
        '\u001b[33msrc/b.ts:4:27\u001b[39m',
      ),
    },
    {
      // R7: the console prints the report as an error, with the file and the
      // stack the failing hook adds
      name: 'the console text of an error, with a file and a stack',
      text: `Error: ${report.trimStart()}\n  File: /project/src/b.ts:4:27\n    at transform (file:///x/plugin.js:1:2)\n    at async run (file:///x/run.js:3:4)`,
      root: '/project',
    },
  ])('reads the same content with $name', ({ text, root }) => {
    const output = root ? { root, diagnostics: [{ text }] } : text
    expect(violationReports(output)).toEqual([
      {
        ...read,
        suggestions: expect.any(Array),
        text: expect.any(String),
      },
    ])
  })

  test('reads two reports of one text, with or without a blank line between them', () => {
    const second = print(layout, { ...sample, importer: 'src/c.ts' })
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

  test('reads a report without a location, a trace or a code frame', () => {
    const bare = print(layout, {
      ...sample,
      location: undefined,
      trace: [],
      frame: undefined,
    })
    expect(violationReports(bare)).toEqual([
      {
        environment: 'client',
        importer: 'src/b.ts',
        specifier: './secret.server',
        resolved: 'src/secret.server.ts',
        trace: [],
        suggestions: expect.any(Array),
        text: expect.any(String),
      },
    ])
  })

  // The resolved file of a package specifier is the package's: an importer
  // whose path ends like the specifier stays the importer.
  test('tells an importer named like a package specifier from its resolved file', () => {
    const [report] = violationReports(
      print(layout, {
        ...sample,
        importer: 'src/uses/pg.ts',
        location: undefined,
        specifier: 'pg',
        resolved: 'node_modules/pg/lib/index.js',
        trace: [],
        frame: undefined,
      }),
    )
    expect(report).toMatchObject({
      importer: 'src/uses/pg.ts',
      specifier: 'pg',
      resolved: 'node_modules/pg/lib/index.js',
    })
  })

  // The chain is read from the entry to the importer whichever way it is
  // printed: the end at the importer decides (SPEC J6.5, ruling R10).
  test('reads the chain from the entry, decided by the importer end', () => {
    const [report] = violationReports(
      print(layout, {
        ...sample,
        trace: [
          { file: 'src/main.ts', at: '1:1', imports: './b' },
          { file: 'src/b.ts', at: '4:27', imports: './secret.server' },
        ],
      }),
    )
    expect(report!.trace.map(({ at }) => at)).toEqual([
      'src/main.ts:1:1',
      'src/b.ts:4:27',
    ])
  })

  // The importer's end is also the step importing the denied specifier,
  // when the report names the importer by another path (a known bug prints
  // `b.ts` for `src/b.ts`).
  test('reads the chain from the entry when the importer is named by another path', () => {
    const [report] = violationReports(
      print(layout, {
        ...sample,
        importer: 'b.ts',
        trace: [
          { file: 'src/main.ts', at: '1:1', imports: './b' },
          { file: 'src/b.ts', at: '4:27', imports: './secret.server' },
        ],
      }),
    )
    expect(report!.trace.map(({ at }) => at)).toEqual([
      'src/main.ts:1:1',
      'src/b.ts:4:27',
    ])
  })

  test('ignores another diagnostic, and the runtime access report of a dev mock', () => {
    const access = `Error: [import-protection] Mocked import used in dev client

Denied import: "./secret.server"
Importer: src/b.ts
Access: secret() (call)

Trace:
  1. src/entry.ts

Fix: Use createServerFn().`
    const accessOtherWords = `Import protection: code touched a mocked (denied) import at runtime

Denied specifier -> ./secret.server
Importer -> src/b.ts
Operation -> call on secret()`
    expect(
      reportedViolations([
        access,
        accessOtherWords,
        'warn: src/a.ts (2:3): "x" is not exported by "src/b.ts", imported by "src/a.ts".',
        '[vite] the server environment is ready',
        report,
      ]),
    ).toEqual([{ environment: 'client', importer: 'src/b.ts:4:27' }])
  })

  test.each([
    {
      name: 'without an importer anywhere',
      text: report
        .split('\n')
        .filter(
          (line) =>
            !line.includes('src/b.ts') && !/^\s*>?\s*\d*\s*\|/.test(line),
        )
        .join('\n'),
    },
    {
      name: 'without a specifier',
      text: report.replace(
        /^\s*\w[\w ]*(?::|->)\s*["'`]\.\/secret\.server["'`]\s*$/gm,
        '',
      ),
    },
    {
      name: 'whose header names no environment type',
      text: report.replace(
        /^.*\b(?:denied|not allowed)\b.*$/m,
        '[import-protection] Import denied',
      ),
    },
    {
      name: 'whose header names both environment types alike',
      text: report.replace(
        /^.*\b(?:denied|not allowed)\b.*$/m,
        '[import-protection] Import denied between client and server',
      ),
    },
  ])('fails on an import-protection diagnostic $name', ({ text }) => {
    expect(() => violationReports(text)).toThrow(/import-protection report/)
  })

  // A report is a warning or an error (coordinator ruling 2026-10-21,
  // diagnostic severity): the same text logged as info is no report.
  test('reads only warnings and errors of a channel as reports', () => {
    const at = (severity: string) => ({
      root: '/project',
      diagnostics: [{ severity, text: report }],
    })
    expect(violationReports(at('info'))).toEqual([])
    expect(violationReports(at('warning'))).toHaveLength(1)
    expect(violationReports(at('error'))).toHaveLength(1)
  })

  // The report's frame keeps the `>`/`^` convention (J6.12): a frame
  // without it is not read as the report's frame.
  test('a code frame without a highlighted line is not the report frame', () => {
    const [read] = violationReports(report.replace('  > 4 |', '    4 |'))
    expect(read!.code).toBeUndefined()
  })

  // A tool may print another frame around the report (R7: a generic frame of
  // the failing module, without `>`, before the report's own).
  test("reads the report's frame next to another tool's frame", () => {
    const [plain] = violationReports(report)
    const toolFrame = [
      '    1 | import { secret } from "./secret.server";',
      '      | ^',
      '    2 | export const leak = () => secret();',
    ]
    const lines = report.split('\n')
    const at = lines.findIndex((line) => /^\s*>\s*4 \|/.test(line)) - 2
    lines.splice(at, 0, ...toolFrame, '')
    const [read] = violationReports(lines.join('\n'))
    expect(read!.code).toEqual(plain!.code)
  })
})

describe('suggestedDirections', () => {
  const withSuggestions = (suggestions: Array<string>, frame?: Array<string>) =>
    print('today', { ...sample, suggestions, frame: frame ?? sample.frame })

  test('API names quoted in source do not substitute for actionable suggestions', () => {
    const frame = [
      '  > 4 | export const leak = () => createServerFn()',
      '      |                           ^',
    ]
    expect(
      suggestedDirections(withSuggestions(['Review your code'], frame)),
    ).toEqual([])
    expect(
      suggestedDirections(
        withSuggestions(['Move this import into a server-only module'], frame),
      ),
    ).toEqual(['server'])
  })
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
    {
      text: 'Move this import into a server-only module',
      directions: ['server'],
    },
    {
      text: 'Keep this import in a client-only module',
      directions: ['client'],
    },
    // Whole names only.
    { text: 'myCreateServerFnHelper', directions: [] },
  ])('$text: $directions', ({ text, directions }) => {
    expect(suggestedDirections(withSuggestions([text]))).toEqual(directions)
  })
})

// The shared location oracle on fixed reports (SPEC J6.5, §5.7, §5.14; V1R
// ip I01): the importer may be reported at the genuine use or at its import
// of the denied module, never elsewhere nor without coordinates, and the
// frame shows the original line there, whatever its context.
describe('expected violations and frames', () => {
  const source = `import { secret } from './secret.server'
// helper
export const one = 1
export const leak = () => secret()
`
  const expected: Array<ExpectedViolation> = [
    { environment: 'client', use: 'src/b.ts:4:27', source },
  ]
  /** The report of `sample` located at `line:column`, framed there. */
  const reportAt = (
    location: { line: number; column: number } | undefined,
    overrides: Partial<Sample> = {},
    layout: Layout = 'today',
  ) =>
    print(layout, {
      ...sample,
      location,
      frame: location && [
        `  > ${location.line} | ${source.split('\n')[location.line - 1]}`,
        `    ${' '.repeat(String(location.line).length)} | ${' '.repeat(location.column - 1)}^`,
      ],
      ...overrides,
    })

  test.each(layouts)(
    'a report at the use or at any column of the import passes, with its frame (%s layout)',
    (layout) => {
      for (const location of [
        { line: 4, column: 27 },
        { line: 1, column: 1 },
        { line: 1, column: 24 },
      ]) {
        const text = reportAt(location, {}, layout)
        expectViolationsAt(text, expected)
        expectReportFrame(violationReports(text)[0]!, source)
      }
    },
  )

  test.each([
    ['another line', reportAt({ line: 3, column: 1 })],
    ['another column of the use line', reportAt({ line: 4, column: 1 })],
    ['no coordinates', reportAt(undefined)],
    [
      'the other environment',
      reportAt({ line: 4, column: 27 }, { environment: 'server' }),
    ],
    ['no report', ''],
    [
      'two reports of the violation, at the import and at the use',
      `${reportAt({ line: 1, column: 1 })}\n\n${reportAt({ line: 4, column: 27 })}`,
    ],
  ])('%s fails', (_name, text) => {
    expect(() => expectViolationsAt(text, expected)).toThrow()
  })

  // `locatedImporters` (which importers are reported): the importer's file
  // only at a relevant original place, never at compiled coordinates nor
  // without coordinates.
  const notRelevant = (location: string) =>
    `client ${location} (not at a relevant original place)`
  test.each([
    ['the use', reportAt({ line: 4, column: 27 }), 'client src/b.ts'],
    ['the import', reportAt({ line: 1, column: 10 }), 'client src/b.ts'],
    [
      'another line',
      reportAt({ line: 3, column: 1 }),
      notRelevant('src/b.ts:3:1'),
    ],
    [
      'another column of the use line',
      reportAt({ line: 4, column: 1 }),
      notRelevant('src/b.ts:4:1'),
    ],
    [
      'a line past the end (compiled coordinates)',
      print('today', {
        ...sample,
        location: { line: 9, column: 4 },
        frame: undefined,
      }),
      notRelevant('src/b.ts:9:4'),
    ],
    [
      'a bundler path (a source map of the bundle, not the original file)',
      print('today', {
        ...sample,
        importer: 'webpack:/src/b.ts',
        frame: undefined,
      }),
      notRelevant('webpack:/src/b.ts:4:27'),
    ],
    ['no coordinates', reportAt(undefined), notRelevant('src/b.ts')],
  ])('locatedImporters: a report at %s', (_name, text, located) => {
    expect(locatedImporters(text, { 'src/b.ts': source })).toEqual([located])
  })

  test('locatedImporters: a report naming the resolved file as its import is located by the import it resolves from', () => {
    const resolvedAs = (location: { line: number; column: number }) =>
      reportAt(location, {
        specifier: 'src/secret.server.ts',
        resolved: undefined,
      })
    expect(
      locatedImporters(resolvedAs({ line: 4, column: 27 }), {
        'src/b.ts': source,
      }),
    ).toEqual(['client src/b.ts'])
    expect(
      locatedImporters(resolvedAs({ line: 3, column: 1 }), {
        'src/b.ts': source,
      }),
    ).toEqual([notRelevant('src/b.ts:3:1')])
    // (another file of that name is not the import)
    expect(
      locatedImporters(
        reportAt(
          { line: 1, column: 1 },
          { specifier: 'src/other.server.ts', resolved: undefined },
        ),
        { 'src/b.ts': source },
      ),
    ).toEqual([notRelevant('src/b.ts:1:1')])
  })

  // SPEC J6.5: never an erased type position; a same-name local is another
  // binding, not a use of the import.
  test.each([
    ['the use', { line: 3, column: 35 }, 'client src/b.ts'],
    [
      'a type position (`typeof secret`)',
      { line: 2, column: 33 },
      notRelevant('src/b.ts:2:33'),
    ],
    [
      'a call of a same-name parameter',
      { line: 4, column: 48 },
      notRelevant('src/b.ts:4:48'),
    ],
  ])(
    'locatedImporters: in a typed module, a report at %s',
    (_name, location, located) => {
      const typed = `import { secret } from './secret.server'
type Secret = ReturnType<typeof secret>
export const leak = (): Secret => secret()
export const local = (secret: () => string) => secret()
`
      const text = print('today', { ...sample, location, frame: undefined })
      expect(locatedImporters(text, { 'src/b.ts': typed })).toEqual([located])
    },
  )

  test('locatedImporters: a file whose source is unknown is not located', () => {
    expect(locatedImporters(reportAt({ line: 4, column: 27 }), {})).toEqual([
      'client src/b.ts:4:27 (not at a relevant original place)',
    ])
  })

  test('locatedImporters: a marker violation may be at the marked module, on its marker import or without coordinates', () => {
    const marked = `export const before = 1
import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`
    const markerAt = (location: { line: number; column: number } | undefined) =>
      print('today', {
        ...sample,
        rule: 'marker',
        importer: 'src/marked.ts',
        location,
        resolved: undefined,
        frame: undefined,
      })
    const sources = { 'src/b.ts': source, 'src/marked.ts': marked }
    expect(locatedImporters(markerAt({ line: 2, column: 1 }), sources)).toEqual(
      ['client src/marked.ts'],
    )
    expect(locatedImporters(markerAt(undefined), sources)).toEqual([
      'client src/marked.ts',
    ])
    expect(locatedImporters(markerAt({ line: 3, column: 1 }), sources)).toEqual(
      [notRelevant('src/marked.ts:3:1')],
    )
  })

  test('a frame that highlights another line, or whose caret is elsewhere, fails', () => {
    const [report] = violationReports(reportAt({ line: 4, column: 27 }))
    for (const code of [
      { ...report!.code!, line: 3 },
      { ...report!.code!, pointsAt: 'leak = () => secret()' },
      { ...report!.code!, shows: ['export const one = 1'] },
      { ...report!.code!, location: 'src/b.ts:1:1' },
    ]) {
      expect(() => expectReportFrame({ ...report!, code }, source)).toThrow()
    }
  })
})
