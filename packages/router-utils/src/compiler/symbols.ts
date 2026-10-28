/**
 * One numeric id space for source and generated bindings.
 * Source symbols are Yuku binding ids; generated symbols are appended. The
 * `Binding → id` map is the binding's own id, so no Yuku object is retained
 * by anything that stores a `SymbolId`.
 */
import { BindingFlags } from 'yuku'
import type { Binding, Scope, SourceFile } from 'yuku'

/** Runs in the bundler's process only: the environment is read once, not per binding. */
const DEV = process.env.NODE_ENV !== 'production'

export type SymbolId = number & { __sym: true }

/** Binding flags of declarations with a runtime value. */
const VALUE_BINDING_FLAGS =
  BindingFlags.FunctionScopedVariable |
  BindingFlags.BlockScopedVariable |
  BindingFlags.Function |
  BindingFlags.Class |
  BindingFlags.RegularEnum |
  BindingFlags.ConstEnum |
  BindingFlags.ValueModule |
  BindingFlags.ValueImport

/**
 * Whether a binding has a runtime value: a type-only import (`import type
 * * as React`, `import { type X }`), an interface, a type alias or a
 * type-only namespace has none, so no value read ever binds to it (a
 * reference TypeScript erases keeps nothing alive and crosses no output).
 */
export function hasRuntimeValue(b: Binding): boolean {
  return b.has(VALUE_BINDING_FLAGS)
}

/**
 * The binding a value read of `name` written in `scope` would resolve to, or
 * null when the name is unbound or bound to a declaration without a runtime
 * value. Every read the compiler synthesises from a name rather than from a
 * reference (the JSX factory of the classic runtime, a Solid `use:`
 * directive) resolves through this, so a type-only binding of the name
 * never becomes a value read.
 */
export function valueBinding(scope: Scope, name: string): Binding | null {
  const b = scope.lookup(name, 'value')
  return b !== null && hasRuntimeValue(b) ? b : null
}

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
  /** Whether a source binding is declared `const`. */
  constant: boolean
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
        constant: b.has(BindingFlags.Const),
      })
    }
    this.sourceCount = this.infos.length
  }

  ofBinding(b: Binding): SymbolId {
    if (DEV && this.file && b.file !== this.file) {
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
      constant: false,
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

  isConst(s: SymbolId): boolean {
    return this.infos[s]!.constant
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
