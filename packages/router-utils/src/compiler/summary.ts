/**
 * Module summaries and the export-facts digest. A summary is a function of the
 * module's raw text, env-independent, holds no AST, and its digest covers only
 * what importers can observe.
 */
import { digestOf } from './identity'
import { ownEntry } from './strings'
import { ValueAnalysis, stripSites } from './values'
import type { AbstractValue, RecognizerTable } from './values'
import type { ModuleAnalysis } from './analysis'

type ExportFact =
  | { kind: 'local'; value: AbstractValue }
  | { kind: 'reExport'; specifier: string; fromName: string }
  | { kind: 'namespace'; specifier: string }

export interface ModuleSummary {
  exports: Record<string, ExportFact>
  stars: Array<string>
  marker: ModuleAnalysis['markers']
  /**
   * Per export, the digest of what an importer reading it observes (the
   * fact, sites stripped): an importer depends on the exports it reads
   * only, so another export changing leaves its plan current. Filled as
   * the exports are read (`exportKeyOf`): a module's importers read few of
   * its exports. Read through `exportKeyOf` only: an export not read yet
   * has no entry.
   */
  readonly exportKeyMemo: Record<string, string>
  /** `summaryDigest`'s answer, once asked (set at build for a known package's synthetic summary). */
  digestMemo?: string
}

function exportKey(f: ExportFact): string {
  return digestOf(
    f.kind === 'local' ? { kind: 'local', value: stripSites(f.value) } : f,
  )
}

/** The key of export `name` (`ModuleSummary.exportKeyMemo`); null when the module has no such export. */
export function exportKeyOf(
  summary: ModuleSummary,
  name: string,
): string | null {
  const known = ownEntry(summary.exportKeyMemo, name)
  if (known !== undefined) {
    return known
  }
  const f = ownEntry(summary.exports, name)
  if (f === undefined) {
    return null
  }
  return (summary.exportKeyMemo[name] = exportKey(f))
}

/** EXPORT-FACTS DIGEST over {exportKeys, stars, marker}: what a reader of the whole summary (a listing of its exports) depends on. */
export function summaryDigest(summary: ModuleSummary): string {
  if (summary.digestMemo === undefined) {
    for (const name of Object.keys(summary.exports)) {
      exportKeyOf(summary, name)
    }
    summary.digestMemo = digestOf({
      exports: summary.exportKeyMemo,
      stars: summary.stars,
      marker: summary.marker,
    })
  }
  return summary.digestMemo
}

/** Every export's key, computed now (a known package's synthetic summary). */
export function exportKeysOf(
  exports: ModuleSummary['exports'],
): ModuleSummary['exportKeyMemo'] {
  const keys: Record<string, string> = Object.create(null)
  for (const [name, f] of Object.entries(exports)) {
    keys[name] = exportKey(f)
  }
  return keys
}

export function buildSummary(
  analysis: ModuleAnalysis,
  table: RecognizerTable,
): ModuleSummary {
  const file = analysis.file
  const { declarations } = analysis
  const values = new ValueAnalysis(file, { table, declarations })
  // (an export may be named `__proto__`)
  const exportFacts: Record<string, ExportFact> = Object.create(null)
  const stars: Array<string> = []
  for (const e of analysis.exports) {
    switch (e.kind) {
      case 'local': {
        if (e.typeOnly) {
          break
        }
        let value: AbstractValue = { t: 'unknown' }
        if (e.local !== null) {
          value = values.valueOfBinding(e.local)
        }
        exportFacts[e.name] = { kind: 'local', value }
        break
      }
      case 'expression': {
        const stmt = file.program.body.find(
          (n) =>
            n.type === 'ExportDefaultDeclaration' && n.start === e.range.start,
        )
        const value: AbstractValue =
          stmt && stmt.type === 'ExportDefaultDeclaration'
            ? values.valueOf(stmt.declaration)
            : { t: 'unknown' }
        exportFacts.default = { kind: 'local', value }
        break
      }
      case 'reExport':
        if (!e.typeOnly) {
          exportFacts[e.name] = {
            kind: 'reExport',
            specifier: e.specifier,
            fromName: e.fromName,
          }
        }
        break
      case 'namespace':
        if (!e.typeOnly) {
          exportFacts[e.name] = { kind: 'namespace', specifier: e.specifier }
        }
        break
      case 'star':
        if (!e.typeOnly) {
          stars.push(e.specifier)
        }
        break
    }
  }
  return {
    exports: exportFacts,
    stars,
    marker: analysis.markers,
    exportKeyMemo: Object.create(null),
  }
}
