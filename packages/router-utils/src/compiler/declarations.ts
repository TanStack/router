/**
 * The declaration table: what each declaration of a name is.
 *
 * A name can have several declarations (`const X` + `type X`, `enum E` +
 * `namespace E`, a function's overloads, a reopened namespace). Each declares
 * the name in some of TypeScript's three spaces, and each either runs or is
 * erased by TypeScript. A reference names the declarations of its own space
 * (`resolve`).
 *
 * This is the one place that reads a declaration's syntax and its binding's
 * flags to say what it means. The units, placement's removal rule, the
 * definitions below the units and the closure read it.
 */
import { BindingFlags } from 'yuku'
import { declaredNames, namespaceName } from './source'
import type { Binding, Node, Reference, SourceFile } from 'yuku'

export const VALUE = 1
export const TYPE = 2
export const NAMESPACE = 4

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

export interface Declaration {
  /**
   * The declaring node: a declarator, a function, class, `enum`, namespace,
   * alias, interface or `import =` declaration, an import specifier. For a
   * parameter or a `catch` binding: the name.
   */
  node: Node
  /** The declared name. */
  id: Node
  /** The spaces it declares the name in; 0: those of what it imports. */
  spaces: number
  /**
   * - `definition`: it runs, and only to give the name its value;
   * - `statement`: it runs and does more (`using` disposes what it declares);
   * - `erased`: TypeScript erases it, its text is types: an alias, an
   *   interface, a namespace that holds only types, a type-only import, and a
   *   `declare` of a value (the value's own text, without code).
   */
  kind: 'definition' | 'statement' | 'erased'
}

type Row = Omit<Declaration, 'id'>

const runs = (declare: boolean | undefined): Declaration['kind'] =>
  declare === true ? 'erased' : 'definition'

/**
 * What a declaring node is; null for a node that declares nothing by itself.
 * A `VariableDeclaration` answers for its declarators.
 */
export function classify(
  file: SourceFile,
  node: Node,
  /**
   * The binding the row is for: an inner name of `namespace A.B` has its own
   * runtime content, and a name with an ambient declaration may have this
   * one inside `declare global {}` or `declare namespace {}`, where a
   * declaration is ambient without the keyword. The binding's flag alone
   * does not make a declaration ambient: a definition beside a `declare`
   * of its name runs.
   */
  binding?: Binding,
  /** The statement of a declarator or an import specifier, when the caller holds it. */
  statement?: Node,
): Row | null {
  const ambient =
    binding?.has(BindingFlags.Ambient) === true && inAmbientContext(file, node)
  switch (node.type) {
    case 'VariableDeclarator': {
      const s = statement ?? file.parentOf(node)
      return s?.type === 'VariableDeclaration'
        ? { ...classify(file, s, binding)!, node }
        : null
    }
    case 'VariableDeclaration':
      return {
        node,
        spaces: VALUE,
        kind:
          node.declare || ambient
            ? 'erased'
            : node.kind === 'var' ||
                node.kind === 'let' ||
                node.kind === 'const'
              ? 'definition'
              : 'statement',
      }
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
      // (an overload is text of the function it belongs to)
      return { node, spaces: VALUE, kind: runs(node.declare || ambient) }
    case 'ClassDeclaration':
      return {
        node,
        spaces: VALUE | TYPE,
        kind: runs(node.declare || ambient),
      }
    case 'TSEnumDeclaration':
      return {
        node,
        spaces: VALUE | TYPE | NAMESPACE,
        kind: runs(node.declare || ambient),
      }
    case 'TSModuleDeclaration': {
      // (runtime content anywhere makes every declaration of the namespace
      // the value's: the parser's flag is the binding's)
      const id = namespaceName(node)
      const value =
        (binding ?? (id === null ? null : file.bindingOf(id)))?.has(
          BindingFlags.ValueModule,
        ) === true
      return {
        node,
        spaces: value ? VALUE | NAMESPACE : NAMESPACE,
        kind: value ? runs(node.declare || ambient) : 'erased',
      }
    }
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
      return { node, spaces: TYPE, kind: 'erased' }
    case 'TSImportEqualsDeclaration':
      return { node, spaces: 0, kind: runs(node.importKind === 'type') }
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier': {
      const s = statement ?? file.parentOf(node)
      const typeOnly =
        (s?.type === 'ImportDeclaration' && s.importKind === 'type') ||
        (node.type === 'ImportSpecifier' && node.importKind === 'type')
      return { node, spaces: 0, kind: runs(typeOnly) }
    }
    default:
      return null
  }
}

/** Whether a declaration stands inside `declare global {}` or `declare namespace {}`. */
function inAmbientContext(file: SourceFile, node: Node): boolean {
  for (let p = file.parentOf(node); p !== null; p = file.parentOf(p)) {
    if (p.type === 'TSModuleDeclaration') {
      if (p.declare) {
        return true
      }
    } else if (
      p.type !== 'TSModuleBlock' &&
      p.type !== 'ExportNamedDeclaration' &&
      p.type !== 'VariableDeclaration'
    ) {
      return false
    }
  }
  return false
}

/** The rows of a binding: every declaration of it (`Declarations.of` keeps them). */
function rowsOf(file: SourceFile, b: Binding): Array<Declaration> {
  return b.declarations.map((id) => {
    // up to the node that declares the name: `namespace A.B {}` declares
    // `A`, and `B` inside it; a name of a pattern is its declarator's
    let n: Node = id
    let p = file.parentOf(n)
    while (
      p !== null &&
      (p.type === 'TSQualifiedName' ||
        p.type === 'ObjectPattern' ||
        p.type === 'ArrayPattern' ||
        (p.type === 'Property' && p.value === n) ||
        (p.type === 'RestElement' && p.argument === n) ||
        (p.type === 'AssignmentPattern' && p.left === n))
    ) {
      n = p
      p = file.parentOf(n)
    }
    // (a parameter's name stands in its function's node, an enum member's
    // in the enum's: only the node's own name is declared by it)
    const own =
      p === null ? null : 'local' in p ? p.local : 'id' in p ? p.id : null
    const row = own === n ? classify(file, p!, b) : null
    return row === null
      ? { node: id, id, spaces: VALUE, kind: 'definition' }
      : { ...row, id }
  })
}

/**
 * Whether a name is ambient: no declaration of it runs, so the module holds
 * no value for it (`declare const x`, a member of `declare global {}`). A
 * definition beside a `declare` of its name is not: the name has a value
 * here, whatever comes first.
 */
export function isAmbient(file: SourceFile, b: Binding): boolean {
  return (
    b.has(BindingFlags.Ambient) &&
    rowsOf(file, b).every(
      (d) => d.kind === 'erased' || (d.spaces & VALUE) === 0,
    )
  )
}

/** Whether a declaration is a definition: one answer, for placement's units and the definitions below them. */
export function isDefinition(
  file: SourceFile,
  node: Node,
  binding?: Binding,
): boolean {
  return classify(file, node, binding)?.kind === 'definition'
}

/** What a reference names. */
export interface Named {
  /** It names the value: the name is used, and so is what its text names. */
  value: boolean
  /**
   * The `import A = N` aliases it names for a type only, the one at the
   * reference first, then each one its chain goes through (`import B = A`);
   * null: none. Each alias was used, so its statement can leave; what the
   * statements name was not: the reference's own path says what of `N` is
   * named.
   */
  aliases: ReadonlyArray<Binding> | null
  /** The type declarations it names (an alias, an interface, a namespace that holds only types); null: none. */
  types: ReadonlyArray<Declaration> | null
  /** For a qualifier (`N.A.T`): the names after it. */
  path: ReadonlyArray<string> | null
}

/** A binding with these has more than one meaning, or a type's only. */
const SEVERAL =
  BindingFlags.Interface | BindingFlags.TypeAlias | BindingFlags.NamespaceModule
const THE_VALUE: Named = { value: true, aliases: null, types: null, path: null }
const NOTHING: Named = {
  value: false,
  aliases: null,
  types: null,
  path: null,
}
const NONE: ReadonlyArray<Declaration> = []

export class Declarations {
  private readonly rows: Array<ReadonlyArray<Declaration> | undefined> = []
  private readonly named = new Map<number, Named>()
  /** Per `import A = N.M` binding: `N`'s binding and the names after it; null: no such alias. */
  private readonly aliases = new Map<
    number,
    { target: Binding; names: Array<string> } | null
  >()
  private declared: Set<number> | null = null

  constructor(private readonly file: SourceFile) {}

  /** Every declaration of a binding. */
  of(b: Binding): ReadonlyArray<Declaration> {
    return (this.rows[b.id] ??= rowsOf(this.file, b))
  }

  /**
   * The declarations of a value that TypeScript erases: a `declare` of it.
   * Their text is the value's, and no output holds code for it.
   */
  ambient(b: Binding): ReadonlyArray<Declaration> {
    return b.has(BindingFlags.Ambient | SEVERAL) || this.declares().has(b.id)
      ? this.of(b).filter(
          (d) => d.kind === 'erased' && (d.spaces & VALUE) !== 0,
        )
      : NONE
  }

  /**
   * The bindings a top-level `declare` of a value declares. Beside a
   * definition of the same name (`declare var x` + `var x`) the parser's
   * ambient flag is not set, and nothing else says the name has such a row.
   */
  private declares(): Set<number> {
    if (this.declared === null) {
      this.declared = new Set()
      for (const statement of this.file.program.body) {
        const decl =
          statement.type === 'ExportNamedDeclaration' &&
          statement.declaration !== null
            ? statement.declaration
            : statement
        const row = classify(this.file, decl)
        if (row?.kind === 'erased' && (row.spaces & VALUE) !== 0) {
          for (const id of declaredNames(decl)) {
            const b = this.file.bindingOf(id)
            if (b !== null) {
              this.declared.add(b.id)
            }
          }
        }
      }
    }
    return this.declared
  }

  /** The declarations a reference names: those of its space. */
  resolve(b: Binding, ref: Reference): Named {
    const space = ref.space
    return space === 'namespace'
      ? this.at(b, NAMESPACE, this.pathFrom(ref.node))
      : this.at(
          b,
          space === 'type' ? TYPE : space === 'any' ? TYPE | NAMESPACE : VALUE,
        )
  }

  /**
   * What naming `b` in the spaces `asked` names, and for a qualifier the
   * names after it (`path`). One answer per binding and spaces, but for a
   * qualifier.
   */
  at(
    b: Binding,
    asked: number,
    path: ReadonlyArray<string> | null = null,
    /** (aliases followed so far: a cycle of them is not valid TypeScript) */
    depth = 0,
  ): Named {
    if (!b.has(SEVERAL)) {
      // one meaning: a type-only import (a type from elsewhere: nothing of
      // this file), or the value
      if (!hasRuntimeValue(b)) {
        return NOTHING
      }
      if (asked !== VALUE && b.has(BindingFlags.ValueImport)) {
        // `import A = N.M` is a name for what `N.M` names: a reference to
        // it names what the whole path selects there. Where that is a type
        // declaration and no value, the alias is named for a type only: a
        // value declared beside `N`'s namespace was not used
        const alias = this.alias(b)
        if (alias !== null && depth < 8) {
          const through = this.at(
            alias.target,
            NAMESPACE,
            [...alias.names, ...(path ?? [])],
            depth + 1,
          )
          return through.types === null
            ? THE_VALUE
            : through.value
              ? through
              : { ...through, aliases: [b, ...(through.aliases ?? [])] }
        }
      }
      // (a type-only import beside a value of its name is two meanings)
      if (!b.has(BindingFlags.TypeImport)) {
        return THE_VALUE
      }
    }
    const rows = this.of(b)
    if (path !== null) {
      // `E.A` of an enum is the enum's member, not a member of a namespace
      // declared beside it
      return path.length === 1 && rows.some((d) => isEnumWith(d.node, path[0]!))
        ? THE_VALUE
        : naming(
            rows.filter(
              (d) =>
                d.node.type !== 'TSEnumDeclaration' && answers(d, NAMESPACE),
            ),
            path,
          )
    }
    const key = b.id * 8 + asked
    let named = this.named.get(key)
    if (named === undefined) {
      let hit = rows.filter((d) => answers(d, asked))
      // (`export type { x }` of a name with no type: the value)
      if (hit.length === 0 && asked === (TYPE | NAMESPACE)) {
        hit = rows.filter((d) => answers(d, VALUE))
      }
      this.named.set(key, (named = naming(hit, null)))
    }
    return named
  }

  /**
   * What a qualified name names at a member of a namespace, with the names
   * `after` it: the last name is a type (the member's alias and interface),
   * or where it has none a namespace, whole; a name before the last is a
   * namespace.
   */
  member(b: Binding, after: ReadonlyArray<string>): Named {
    const type = after.length === 0 ? this.at(b, TYPE) : NOTHING
    return type.types !== null ? type : this.at(b, NAMESPACE, after)
  }

  /** What `import A = N.M` stands for, when `N` is a name of this file. */
  private alias(b: Binding): { target: Binding; names: Array<string> } | null {
    let alias = this.aliases.get(b.id)
    if (alias === undefined) {
      alias = null
      // (an import with no module: `import A = N`, at any level)
      const decl =
        b.has(BindingFlags.ValueImport) && b.import === null
          ? this.of(b)[0]?.node
          : undefined
      if (decl?.type === 'TSImportEqualsDeclaration') {
        const names: Array<string> = []
        let left: Node = decl.moduleReference
        while (left.type === 'TSQualifiedName') {
          names.unshift(left.right.name)
          left = left.left
        }
        const target = this.file.referenceOf(left)?.binding ?? null
        if (target !== null && target !== b) {
          alias = { target, names }
        }
      }
      this.aliases.set(b.id, alias)
    }
    return alias
  }

  /** The names after a qualifier: `N.A.T` (a qualified type name, or the expression of an `extends` clause). */
  private pathFrom(node: Node): Array<string> {
    const path: Array<string> = []
    let n = node
    for (
      let q = this.file.parentOf(n);
      q !== null;
      n = q, q = this.file.parentOf(q)
    ) {
      if (q.type === 'TSQualifiedName' && q.left === n) {
        path.push(q.right.name)
      } else if (
        q.type === 'MemberExpression' &&
        !q.computed &&
        q.object === n &&
        q.property.type === 'Identifier'
      ) {
        path.push(q.property.name)
      } else {
        break
      }
    }
    return path
  }
}

/** Whether a declaration gives the name a value (an import: unless it is type-only). */
const isValue = (d: Declaration) =>
  d.spaces === 0 ? d.kind !== 'erased' : (d.spaces & VALUE) !== 0

/** Whether a declaration declares the name in one of `spaces` (a type-only import: in any but the value's). */
const answers = (d: Declaration, spaces: number) =>
  d.spaces === 0
    ? spaces !== VALUE || d.kind !== 'erased'
    : (d.spaces & spaces) !== 0

/**
 * What naming these declarations names: the value, and the type declarations
 * of this file among them. A type-only import is neither: a type from
 * elsewhere.
 */
function naming(
  hit: ReadonlyArray<Declaration>,
  path: ReadonlyArray<string> | null,
): Named {
  const types = hit.filter((d) => d.spaces !== 0 && !isValue(d))
  const value = hit.some(isValue)
  return types.length === 0
    ? value
      ? THE_VALUE
      : NOTHING
    : { value, aliases: null, types, path }
}

/** Whether a declaration is an enum's with a member `name`. */
function isEnumWith(decl: Node, name: string): boolean {
  return (
    decl.type === 'TSEnumDeclaration' &&
    decl.body.members.some(
      (m) =>
        m.id.type !== 'TemplateLiteral' &&
        (m.id.type === 'Identifier' ? m.id.name : m.id.value) === name,
    )
  )
}
