/**
 * One numeric id space for source and generated bindings.
 * Source symbols are Yuku binding ids; generated symbols are appended. The
 * `Binding → id` map is the binding's own id, so no Yuku object is retained
 * by anything that stores a `SymbolId`.
 */
import { BindingFlags } from 'yuku'
import { hasRuntimeValue, isAmbient } from './declarations'
import { SELF_CHECKS, internalError } from './self-checks'
import type { Binding, Scope, SourceFile } from 'yuku'

export { hasRuntimeValue }

export type SymbolId = number & { __sym: true }

/**
 * The binding a value read of `name` written in `scope` would resolve to, or
 * null when the name is unbound or bound to a declaration without a runtime
 * value. Every read the compiler synthesises from a name rather than from a
 * reference (a Solid `use:` directive) resolves through this, so a
 * type-only binding of the name never becomes a value read.
 */
export function valueBinding(scope: Scope, name: string): Binding | null {
  const b = scope.lookup(name, 'value')
  return b !== null && hasRuntimeValue(b) ? b : null
}

type SymbolKind = 'source' | 'generated' | 'ambient' | 'synthetic'

/**
 * When a module binding gets its value, by the language's initialisation
 * rule, which decides what code evaluated before its declaration reads:
 * - `start`: an import is initialised when the module is linked, and a
 *   function declaration (an async or generator one too) when the module's
 *   scope is created, before any statement runs.
 * - `undefined`: a `var` is `undefined` until its declarator runs, and
 *   TypeScript compiles an `enum` and a `namespace` to a `var` their
 *   statement assigns.
 * - `declaration`: a `let`, a `const` and a class are uninitialised until
 *   their declaration runs (reading one before it throws).
 */
export type Initialisation = 'start' | 'undefined' | 'declaration'

function initialisationOf(b: Binding): Initialisation {
  if (b.has(BindingFlags.Import) || b.has(BindingFlags.Function)) {
    return 'start'
  }
  if (b.has(BindingFlags.BlockScopedVariable) || b.has(BindingFlags.Class)) {
    return 'declaration'
  }
  return 'undefined'
}

interface SymbolInfo {
  name: string
  kind: SymbolKind
  moduleLevel: boolean
  isImport: boolean
  /** The scope's node range for source bindings (module scope → null). */
  scopeRange: { start: number; end: number } | null
  /** Whether a source binding is a `let`/`var`/parameter (reassignable). */
  reassignable: boolean
  initialisation: Initialisation
}

export class SymbolTable {
  private readonly infos: Array<SymbolInfo> = []
  private readonly sourceCount: number
  /**
   * The ranges of the scopes below the module's that declare a binding (one
   * scope may be listed more than once): what a text is asked about to know
   * which local bindings are visible in it (`removal/closure.ts`).
   */
  readonly localScopes: Array<{ start: number; end: number }> = []
  /**
   * Whether a binding is declared in a namespace's block: it is visible in
   * the namespace's other blocks too (a reopened namespace), outside its
   * scope's range (`removal/closure.ts`).
   */
  readonly namespaceBlocks: boolean

  constructor(private readonly file: SourceFile) {
    const root = file.rootScope
    let last: { start: number; end: number } | null = null
    let namespaceBlocks = false
    for (const b of file.bindings) {
      const moduleLevel = b.scope === root
      let scopeRange: { start: number; end: number } | null = null
      if (!moduleLevel) {
        const node = b.scope.node
        if (
          last !== null &&
          last.start === node.start &&
          last.end === node.end
        ) {
          scopeRange = last
        } else {
          scopeRange = last = { start: node.start, end: node.end }
          this.localScopes.push(scopeRange)
          namespaceBlocks ||= node.type === 'TSModuleBlock'
        }
      }
      this.infos.push({
        name: b.name,
        kind: isAmbient(file, b) ? 'ambient' : 'source',
        moduleLevel,
        isImport: b.has(BindingFlags.Import),
        scopeRange,
        reassignable:
          !b.has(BindingFlags.Const) &&
          !b.has(BindingFlags.Function) &&
          !b.has(BindingFlags.Class) &&
          !b.has(BindingFlags.Import),
        initialisation: initialisationOf(b),
      })
    }
    this.sourceCount = this.infos.length
    this.namespaceBlocks = namespaceBlocks
  }

  ofBinding(b: Binding): SymbolId {
    // our test runs only (`self-checks.ts`): every caller passes a binding of
    // the module's own file (`bindingOf`, `referenceOf`), so it has no
    // warning. It catches compiler bugs and can go once we trust the compiler.
    if (SELF_CHECKS && b.file !== this.file) {
      throw internalError('SymbolTable.ofBinding: binding of another file')
    }
    return b.id as SymbolId
  }

  /** The Yuku binding of a source symbol (ephemeral; only during phase B). */
  binding(s: SymbolId): Binding | null {
    if (s >= this.sourceCount) {
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
      // (a generated declaration is a `const`)
      initialisation: 'declaration',
    })
    return (this.infos.length - 1) as SymbolId
  }

  name(s: SymbolId): string {
    return this.infos[s]!.name
  }

  isModuleLevel(s: SymbolId): boolean {
    return this.infos[s]!.moduleLevel
  }

  /** When the binding gets its value (`Initialisation`). */
  initialisation(s: SymbolId): Initialisation {
    return this.infos[s]!.initialisation
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
