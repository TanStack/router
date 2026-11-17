/**
 * Traces, dev report flushing, original positions and the build verdict
 * on hand-made graphs.
 */
import { describe, expect, test } from 'vitest'
import { resolveImportProtectionConfig } from '../../src/import-protection/config'

import { Locator } from '../../src/import-protection/locate'

import { formatViolation } from '../../src/import-protection/trace'
import { violationInfo } from '../../src/import-protection/violations'
import type { EdgeViolation } from '../../src/import-protection/violations'
import type { ImportProtectionOptions } from '../../src/schema'

function violation(partial: Partial<EdgeViolation> = {}): EdgeViolation {
  return {
    edgeKey: 'k1',
    env: 'client',
    envType: 'client',
    rule: { type: 'file', index: 0 },
    specifier: './secret.server',
    importer: '/app/src/b.ts',
    importerId: '/app/src/b.ts',
    resolved: '/app/src/secret.server.ts',
    loc: { file: '/app/src/b.ts', line: 3, column: 24 },
    snippet: null,
    behavior: 'mock',
    module: null,
    ...partial,
  }
}

describe('an import another plugin added', () => {
  // R101/R102.2: an importer whose source has no pattern import reached the
  // denied file through an import a later plugin's transform added (an
  // auto-import): the report names that, and its fix, not a pattern import
  const denied = '/app/src/db.server.ts'
  const inj = '/app/src/inj.ts'
  const readSource = (file: string) =>
    file === inj ? `export const read = () => 'x'\n` : null
  const self = violation({
    self: true,
    importer: denied,
    importerId: denied,
    resolved: denied,
    specifier: 'src/db.server.ts',
    loc: null,
  })
  const shapes = {
    // a build names each importer the bundle's graph has, after the pattern import found in its source
    build: {
      v: violation({
        importer: inj,
        importerId: inj,
        resolved: denied,
        specifier: 'src/db.server.ts',
        loc: null,
        pattern: null,
      }),
      steps: ['/app/src/entry.ts', inj],
    },
    // a dev server reports the denied file, the importer from the graph
    dev: { v: self, steps: ['/app/src/entry.ts', inj, denied] },
  }

  test.each(Object.entries(shapes))(
    '%s: the report says another plugin added the import, and to keep it from adding the file',
    (_shape, { v, steps }) => {
      const { text } = printedTrace(steps, true, { v, readSource })!
      expect(text).toMatch(/^ {2}Imported by: src\/inj\.ts, .*another plugin/m)
      expect(text).toMatch(/^ {4}- Keep the plugin that adds this import/m)
      expect(text).not.toMatch(/^ {2}Matched by:/m)
    },
  )
})

describe('positions', () => {
  test('without an input map, 1-based line and column of the input (CR, CRLF)', () => {
    const code = `a\r\nb\rimport x from './x'`
    const at = new Locator(code, '/app/src/a.ts', () => null)
    expect(at.at(code.indexOf("'./x'"))).toEqual({
      file: '/app/src/a.ts',
      line: 3,
      column: 15,
    })
  })
})

/** A report's printed trace as structure (step numbers, files and positions, the entry tag) and the steps it says it left out. */
function printedTrace(
  steps: Array<string>,
  fromEntry: boolean,
  o: {
    root?: string
    options?: ImportProtectionOptions
    v?: EdgeViolation
    readSource?: (file: string) => string | null
  } = {},
) {
  const root = o.root ?? '/app'
  const c = resolveImportProtectionConfig(o.options ?? {}, {
    root,
    srcDirectory: `${root.replace(/\/$/, '')}/src`,
    mode: 'dev',
  })!
  const v = o.v ?? violation()
  const text = formatViolation(
    v,
    violationInfo(v, c, () => ({
      steps: steps.map((file) => ({ file })),
      fromEntry,
    })),
    { config: c, readSource: o.readSource ?? (() => null), framework: 'react' },
  )
  const lines = text.split('\n')
  const at = lines.indexOf('  Trace:')
  if (at < 0) {
    return null
  }
  const out: Array<[number, string, boolean]> = []
  let left = 0
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) {
      break
    }
    const m = /^\s+(\d+)\. (\S+)( \(entry\))?/.exec(line)
    if (m) {
      out.push([Number(m[1]), m[2]!, m[3] !== undefined])
    } else {
      left = Number(/\d+/.exec(line)?.[0])
    }
  }
  return { steps: out, left, text }
}
