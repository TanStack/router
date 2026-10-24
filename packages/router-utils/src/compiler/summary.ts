/**
 * Module summaries and the export-facts digest (DESIGN §2.9.1; R20, R23,
 * R36). A summary is a function of the module's raw text, env-independent,
 * holds no AST, and its digest covers only what importers can observe.
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
  canonicalId: string
  rawRevision: string
  exports: Record<string, ExportFact>
  stars: Array<string>
  /** Generated export names per isomorphic implementation (planner-supplied). */
  isoImplExports: Record<string, { server?: string; client?: string }>
  /** Exported object-literal keys (route options imported from another module). */
  objectKeys?: Record<string, Array<string>>
  marker: 'server-only' | 'client-only' | 'conflict' | null
  hasImportOrExport: boolean
  /** EXPORT-FACTS DIGEST over {exports (sites stripped), stars, isoImplExports, objectKeys, marker}. */
  digest: string
}

export interface SummaryExtras {
  isoImplExports?: Record<string, { server?: string; client?: string }>
}

export type SummaryExtraHook = (
  analysis: ModuleAnalysis,
  values: ValueAnalysis,
) => SummaryExtras

export function buildSummary(
  analysis: ModuleAnalysis,
  canonicalId: string,
  rawRevision: string,
  table: RecognizerTable,
  extra?: SummaryExtraHook,
): ModuleSummary {
  const file = analysis.file
  const values = new ValueAnalysis(file, { table })
  const exportFacts: Record<string, ExportFact> = {}
  const stars: Array<string> = []
  const objectKeys: Record<string, Array<string>> = {}
  for (const e of analysis.exports) {
    switch (e.kind) {
      case 'local': {
        if (e.typeOnly) {
          break
        }
        let value: AbstractValue = { t: 'unknown' }
        if (e.local !== null) {
          value = values.valueOfBinding(e.local)
          const b = file.bindings[e.local]
          const decl = b?.declarations[0]
          const parent = decl ? file.parentOf(decl) : null
          if (parent?.type === 'VariableDeclarator' && parent.init) {
            const init = parent.init
            if (init.type === 'ObjectExpression') {
              const keys: Array<string> = []
              let opaque = false
              for (const p of init.properties) {
                if (p.type === 'SpreadElement' || p.computed) {
                  opaque = true
                  break
                }
                keys.push(
                  p.key.type === 'Identifier'
                    ? p.key.name
                    : p.key.type === 'Literal'
                      ? String(p.key.value)
                      : '',
                )
              }
              if (!opaque) {
                objectKeys[e.name] = keys
              }
            }
          }
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
  const extras = extra ? extra(analysis, values) : {}
  const isoImplExports = extras.isoImplExports ?? {}
  const digest = digestOf({
    exports: Object.fromEntries(
      Object.entries(exportFacts).map(([k, f]) => [
        k,
        f.kind === 'local' ? { kind: 'local', value: stripSites(f.value) } : f,
      ]),
    ),
    stars,
    isoImplExports,
    objectKeys,
    marker: analysis.markers,
  })
  return {
    canonicalId,
    rawRevision,
    exports: exportFacts,
    stars,
    isoImplExports,
    objectKeys: Object.keys(objectKeys).length > 0 ? objectKeys : undefined,
    marker: analysis.markers,
    hasImportOrExport: analysis.hasImportOrExport,
    digest,
  }
}
