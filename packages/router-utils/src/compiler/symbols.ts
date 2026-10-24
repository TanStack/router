/**
 * One numeric id space for source and generated bindings (DESIGN §2.3, R25).
 * Source symbols are Yuku binding ids; generated symbols are appended. The
 * `Binding → id` map is the binding's own id, so no Yuku object is retained
 * by anything that stores a `SymbolId`.
 */
import { BindingFlags } from 'yuku'
import type { Binding, SourceFile } from 'yuku'

export type SymbolId = number & { __sym: true }

export type SymbolKind = 'source' | 'generated' | 'ambient' | 'synthetic'

interface SymbolInfo {
  name: string
  kind: SymbolKind
  moduleLevel: boolean
  isImport: boolean
  /** The scope's node range for source bindings (module scope → null). */
  scopeRange: { start: number; end: number } | null
  /** Whether a source binding is a `let`/`var`/parameter (reassignable). */
  reassignable: boolean
}

export class SymbolTable {
  private readonly infos: Array<SymbolInfo> = []
  private readonly sourceCount: number

  constructor(private readonly file: SourceFile | null) {
    const root = file ? file.rootScope : null
    const bindings = file ? file.bindings : []
    for (const b of bindings) {
      const moduleLevel = b.scope === root
      this.infos.push({
        name: b.name,
        kind: b.has(BindingFlags.Ambient) ? 'ambient' : 'source',
        moduleLevel,
        isImport: b.has(BindingFlags.Import),
        scopeRange: moduleLevel
          ? null
          : { start: b.scope.node.start, end: b.scope.node.end },
        reassignable:
          !b.has(BindingFlags.Const) &&
          !b.has(BindingFlags.Function) &&
          !b.has(BindingFlags.Class) &&
          !b.has(BindingFlags.Import),
      })
    }
    this.sourceCount = this.infos.length
  }

  ofBinding(b: Binding): SymbolId {
    if (
      process.env.NODE_ENV !== 'production' &&
      this.file &&
      b.file !== this.file
    ) {
      throw new Error('SymbolTable.ofBinding: binding of another file')
    }
    return b.id as SymbolId
  }

  /** The Yuku binding of a source symbol (ephemeral; only during phase B). */
  binding(s: SymbolId): Binding | null {
    if (!this.file || s >= this.sourceCount) {
      return null
    }
    return this.file.bindings[s] ?? null
  }

  declare(
    name: string,
    kind: 'generated' | 'synthetic' = 'generated',
  ): SymbolId {
    this.infos.push({
      name,
      kind,
      moduleLevel: true,
      isImport: false,
      scopeRange: null,
      reassignable: false,
    })
    return (this.infos.length - 1) as SymbolId
  }

  name(s: SymbolId): string {
    return this.infos[s]!.name
  }

  isModuleLevel(s: SymbolId): boolean {
    return this.infos[s]!.moduleLevel
  }

  isImport(s: SymbolId): boolean {
    return this.infos[s]!.isImport
  }

  kind(s: SymbolId): SymbolKind {
    return this.infos[s]!.kind
  }

  isReassignable(s: SymbolId): boolean {
    return this.infos[s]!.reassignable
  }

  /** The range of the scope node declaring a non-module-level source symbol. */
  scopeRange(s: SymbolId): { start: number; end: number } | null {
    return this.infos[s]!.scopeRange
  }

  get size(): number {
    return this.infos.length
  }

  /** Every name in use, for the name universe. */
  names(): Array<string> {
    return this.infos.map((i) => i.name)
  }
}
