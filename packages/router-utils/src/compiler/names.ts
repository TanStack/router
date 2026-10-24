/**
 * Deterministic, collision-free name allocator per source file (DESIGN §2.8,
 * D10). The universe is every binding name in every scope, every free
 * reference name and every export name; generated names are `base` if free,
 * else `base$n` with the smallest n ≥ 1. JSX tag bases are capitalised and
 * prefixed with `Tsr` when not uppercase-initial.
 */
import { isValidIdentifier } from './strings'
import type { SymbolId, SymbolTable } from './symbols'

export class NameAllocator {
  private readonly taken: Set<string>
  private readonly exportsTaken: Set<string>

  constructor(
    universe: Iterable<string>,
    exportNames: Iterable<string>,
    private readonly symbols: SymbolTable,
  ) {
    this.taken = new Set(universe)
    this.exportsTaken = new Set(exportNames)
  }

  /** Allocates a binding name (and its generated symbol). */
  alloc(
    base: string,
    opts: { jsxTag?: boolean } = {},
  ): { name: string; sym: SymbolId } {
    let b = base
    if (opts.jsxTag && !/^[A-Z]/.test(b)) {
      b = `Tsr${b.charAt(0).toUpperCase()}${b.slice(1)}`
    }
    if (!isValidIdentifier(b)) {
      b = `tsr$${b.replace(/[^\p{ID_Continue}$]/gu, '_')}`
    }
    const name = this.pick(this.taken, b)
    this.taken.add(name)
    return { name, sym: this.symbols.declare(name, 'generated') }
  }

  /** Allocates an export name against the file's export-name universe (no symbol). */
  allocExportName(base: string): string {
    const name = this.pick(this.exportsTaken, base)
    this.exportsTaken.add(name)
    return name
  }

  isExportNameFree(name: string): boolean {
    return !this.exportsTaken.has(name)
  }

  isFree(name: string): boolean {
    return !this.taken.has(name)
  }

  private pick(taken: ReadonlySet<string>, base: string): string {
    if (!taken.has(base)) {
      return base
    }
    for (let n = 1; ; n++) {
      const cand = `${base}$${n}`
      if (!taken.has(cand)) {
        return cand
      }
    }
  }
}
