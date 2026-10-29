/**
 * Module summaries and the export-facts digest. A summary is a function of the
 * module's raw text, env-independent, holds no AST, and its digest covers only
 * what importers can observe.
 */
import { digestOf } from './identity'
import { ValueAnalysis, stripSites } from './values'
import type { AbstractValue, RecognizerTable } from './values'
import type { ModuleAnalysis } from './analysis'

export type ExportFact =
  | { kind: 'local'; value: AbstractValue; noSideEffects?: true }
  | { kind: 'reExport'; specifier: string; fromName: string }
  | { kind: 'namespace'; specifier: string }

export interface ModuleSummary {
  rawRevision: string
  exports: Record<string, ExportFact>
  stars: Array<string>
  hasImportOrExport: boolean
  /** EXPORT-FACTS DIGEST over {exports (sites stripped), stars, marker}. */
  digest: string
}

export function buildSummary(
  analysis: ModuleAnalysis,
  rawRevision: string,
  table: RecognizerTable,
): ModuleSummary {
  const file = analysis.file
  const { declarations } = analysis
  const values = new ValueAnalysis(file, { table, declarations })
  const exportFacts: Record<string, ExportFact> = {}
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
  const digest = digestOf({
    exports: Object.fromEntries(
      Object.entries(exportFacts).map(([k, f]) => [
        k,
        f.kind === 'local' ? { kind: 'local', value: stripSites(f.value) } : f,
      ]),
    ),
    stars,
    marker: analysis.markers,
  })
  return {
    rawRevision,
    exports: exportFacts,
    stars,
    hasImportOrExport: analysis.hasImportOrExport,
    digest,
  }
}
