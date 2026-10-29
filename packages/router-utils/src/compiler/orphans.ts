/**
 * Declarations only erased code read, below the units placement decides
 * (SPEC G16 "destructuring", J4.12): function-local declarators and
 * destructuring leaves of kept declarations. The core runs it once, after
 * every planner erased what it erases (`AnalysisPlan.resolve`), on the env
 * module's liveness. Module-level declarations, imports and their
 * provenance are placement's (`reach.ts`).
 */
import { walk } from 'yuku'
import { extendOverTrailingLine } from './header'
import { isPureClass, isPureExpression } from './purity'
import { patternIdentifiers } from './source'
import type { Node } from 'yuku'
import type { ClassifiedRef } from './analysis'
import type { Range } from './header'
import type { PlanContext } from './plan'
import type { EditScope, Frag, LivenessView, OutputId } from './rewrite'

const text = (part: string): Frag => ({ k: 'text', parts: [part] })
const slice = (range: Range): Frag => ({ k: 'slice', range })
const rangeOf = (n: Node): Range => ({ start: n.start, end: n.end })

const BY = 'core:orphans'
/** An output no planner addresses: its tree holds the edits addressed to every output. */
const EVERY_OUTPUT: OutputId = 'derived:\0every-output'

/** A removal's scope (`scopeOf`) from what orphans it and what it encloses that went before. */
type ScopeOf = (
  refs: ReadonlyArray<ClassifiedRef>,
  gone?: ReadonlyArray<Range>,
) => EditScope

/** The items of one list pruned in a round, with the references of the bindings they declare. */
interface Pruned {
  items: Set<Node>
  refs: Array<ClassifiedRef>
}

const prune = (
  map: Map<Node, Pruned>,
  list: Node,
  item: Node,
  refs: ReadonlyArray<ClassifiedRef>,
) => {
  let p = map.get(list)
  if (!p) {
    p = { items: new Set(), refs: [] }
    map.set(list, p)
  }
  p.items.add(item)
  p.refs.push(...refs)
}

/**
 * Function-local declarators (and `var`/block declarators of the module
 * level the core's units do not model) and destructuring leaves all of
 * whose references are erased in the env output: pure initialisers go with
 * the declarator; an impure initialiser at function level stays as an
 * expression statement (its hook calls keep running); module level drops it
 * with the declaration (J4.12, documented removal). Iterates to a fixpoint.
 */
export function cleanOrphanedDeclarations(ctx: PlanContext): void {
  const { t1, symbols, rewrites } = ctx
  const file = ctx.analysis.file
  const code = ctx.analysis.source.code
  const handled = new Set<number>()
  // each round handles at least one more binding: a chain of declarations
  // each only the next one reads is cleaned however long it is
  for (;;) {
    const live = ctx.liveness('env')
    let shared: LivenessView | null = null
    /**
     * Where a removal applies: in every output when edits addressed to every
     * output alone erased what orphans it (the references of what it
     * removes) and what it encloses that went before (`gone`), else in the
     * env module, whose liveness decides every orphan (an erasure in the env
     * module only leaves the code live where another output renders it: a
     * server-function provider, a split chunk).
     */
    const scopeOf: ScopeOf = (refs, gone = []) => {
      shared ??= ctx.liveness(EVERY_OUTPUT)
      return refs.every((r) => !shared!.live(r)) &&
        gone.every((r) => shared!.isErased(r))
        ? 'all-outputs'
        : ['env']
    }
    let changed = false
    // object pattern properties pruned this round, removed together per pattern
    const prunedProps = new Map<Node, Pruned>()
    // declarators of multi-declarator statements pruned this round, removed
    // together per statement (one edit per statement from the final set)
    const prunedDecls = new Map<Node, Pruned>()
    // declarators removed whole this round (every binding of a pattern)
    const removedDeclarators = new Set<Node>()
    for (const b of file.bindings) {
      if (handled.has(b.id) || b.import) {
        continue
      }
      const sym = symbols.ofBinding(b)
      if (symbols.kind(sym) !== 'source') {
        continue
      }
      // orphaned: read, and only by erased code (most bindings fail here)
      const refs = t1.refs.refsOf(sym)
      if (refs.length === 0 || !refs.every((r) => !live.live(r))) {
        continue
      }
      const decl = b.declarations[0]
      const declParent = decl ? file.parentOf(decl) : null
      // a `var` hoisted out of a nested block is declared by the effect unit
      // (statement) holding it: its declarator is cleaned here, like before
      const declaring = t1.declaringUnits.get(sym)
      if (
        symbols.isModuleLevel(sym) &&
        declaring !== undefined &&
        declaring.some((u) => t1.units[u]!.kind !== 'effect') &&
        declParent?.type !== 'AssignmentPattern' &&
        declParent?.type !== 'Property' &&
        declParent?.type !== 'ArrayPattern' &&
        declParent?.type !== 'RestElement'
      ) {
        continue // the core's placement decides top-level units (destructuring leaves are pruned here)
      }
      if (!decl || b.declarations.length !== 1) {
        continue
      }
      const parent = file.parentOf(decl)
      if (!parent) {
        continue
      }
      if (live.isErased(rangeOf(decl))) {
        handled.add(b.id)
        continue
      }
      const inPattern =
        parent.type === 'AssignmentPattern' ||
        parent.type === 'Property' ||
        parent.type === 'ArrayPattern' ||
        parent.type === 'RestElement'
      // a declarator goes whole when every binding it declares is orphaned
      // (a function-level pattern too: `const {} = serverConfig` would keep
      // reading its import); module-level declarators are placement's
      const declarator =
        parent.type === 'VariableDeclarator' && parent.id === decl
          ? parent
          : inPattern && !symbols.isModuleLevel(sym)
            ? orphanedPatternDeclarator(ctx, decl, live)
            : null
      if (declarator) {
        if (removedDeclarators.has(declarator)) {
          handled.add(b.id)
          continue
        }
        if (removeDeclarator(ctx, declarator, scopeOf, live, prunedDecls)) {
          removedDeclarators.add(declarator)
          handled.add(b.id)
          changed = true
          continue
        }
      }
      if (inPattern) {
        if (prunePatternElement(ctx, decl, refs, scopeOf, prunedProps, live)) {
          handled.add(b.id)
          changed = true
        }
        continue
      }
      if (
        (parent.type === 'FunctionDeclaration' ||
          parent.type === 'ClassDeclaration') &&
        parent.id === decl &&
        t1.inFunctionAt(parent.start)
      ) {
        const stmtParent = file.parentOf(parent)
        if (!stmtParent || stmtParent.type !== 'BlockStatement') {
          continue
        }
        if (
          parent.type === 'ClassDeclaration' &&
          !isPureClass(ctx.analysis.purity, parent)
        ) {
          continue
        }
        handled.add(b.id)
        changed = true
        rewrites.add({
          range: {
            start: parent.start,
            end: extendOverTrailingLine(code, parent.end),
          },
          body: [],
          scope: scopeOf(refs),
          by: BY,
        })
      }
    }
    for (const [pattern, props] of prunedProps) {
      removePatternProperties(ctx, pattern, props, live, scopeOf)
    }
    for (const [statement, decls] of prunedDecls) {
      removeDeclarators(ctx, statement, decls, live, scopeOf)
    }
    if (!changed) {
      break
    }
  }
}

/**
 * Removes a declarator all of whose bindings are orphaned, or reports that
 * it cannot: a single declarator's statement goes, or becomes its impure
 * initialiser at function level; a declarator of several is pruned with its
 * neighbours (`prunedDecls`) unless its initialiser's effects must stay.
 */
function removeDeclarator(
  ctx: PlanContext,
  declarator: Node,
  scopeOf: ScopeOf,
  live: LivenessView,
  prunedDecls: Map<Node, Pruned>,
): boolean {
  if (declarator.type !== 'VariableDeclarator') {
    return false
  }
  // the references of every binding it declares
  const refs = patternIdentifiers(declarator.id).flatMap((id) => {
    const b = ctx.analysis.file.bindingOf(id)
    return b ? ctx.t1.refs.refsOf(ctx.symbols.ofBinding(b)) : []
  })
  const file = ctx.analysis.file
  const code = ctx.analysis.source.code
  const statement = file.parentOf(declarator)
  if (!statement || statement.type !== 'VariableDeclaration') {
    return false
  }
  const moduleLevel = !ctx.t1.inFunctionAt(declarator.start)
  const effectsGo =
    declarator.init === null ||
    isPureExpression(ctx.analysis.purity, declarator.init) ||
    moduleLevel ||
    (!callsHook(declarator.init) &&
      initReadsOnlyOrphanedImports(ctx, declarator.init, live))
  if (statement.declarations.length === 1) {
    if (!isStatementPosition(file.parentOf(statement))) {
      return false
    }
    ctx.rewrites.add(
      effectsGo
        ? {
            range: {
              start: statement.start,
              end: extendOverTrailingLine(code, statement.end),
            },
            body: [],
            scope: scopeOf(refs),
            by: BY,
          }
        : {
            range: { start: statement.start, end: statement.end },
            body: expressionStatement(code, declarator.init!),
            scope: scopeOf(refs),
            by: BY,
          },
    )
    return true
  }
  if (!effectsGo) {
    return false
  }
  prune(prunedDecls, statement, declarator, refs)
  return true
}

/** Whether a statement in `parent` stands in a statement list (it may become another statement or go). */
function isStatementPosition(parent: Node | null): boolean {
  return (
    parent !== null &&
    (parent.type === 'BlockStatement' ||
      parent.type === 'Program' ||
      parent.type === 'SwitchCase' ||
      parent.type === 'StaticBlock')
  )
}

/**
 * The declarator whose pattern holds `decl`, when every binding it declares
 * has references and none is live.
 */
function orphanedPatternDeclarator(
  ctx: PlanContext,
  decl: Node,
  live: LivenessView,
): Node | null {
  const file = ctx.analysis.file
  let node: Node | null = file.parentOf(decl)
  while (
    node &&
    (node.type === 'AssignmentPattern' ||
      node.type === 'Property' ||
      node.type === 'ArrayPattern' ||
      node.type === 'ObjectPattern' ||
      node.type === 'RestElement')
  ) {
    node = file.parentOf(node)
  }
  if (!node || node.type !== 'VariableDeclarator') {
    return null
  }
  for (const id of patternIdentifiers(node.id)) {
    const b = file.bindingOf(id)
    if (!b) {
      return null
    }
    const refs = ctx.t1.refs.refsOf(ctx.symbols.ofBinding(b))
    if (refs.length === 0 || refs.some((r) => live.live(r))) {
      return null
    }
  }
  return node
}

/**
 * `init;` in place of a declaration statement: parenthesised when its first
 * token would start a block, a declaration or a `let` declaration instead
 * (`{ a: f() };`, `function () {}();`). The renderer guards a statement
 * start whose first token could continue the previous line.
 */
function expressionStatement(code: string, init: Node): Array<Frag> {
  const first = code.slice(init.start, init.start + 16)
  const wrap = /^(?:\{|function\b|class\b|async\s+function\b|let\s*\[)/.test(
    first,
  )
  if (wrap) {
    return [text('('), slice(rangeOf(init)), text(');')]
  }
  return [slice(rangeOf(init)), text(';')]
}

/**
 * Removes the declarators `pruned` of a multi-declarator statement: when
 * every declarator is gone (pruned now, or erased by an earlier round) the
 * statement goes with its line; otherwise the gone runs go
 * (`removeListItems`).
 */
function removeDeclarators(
  ctx: PlanContext,
  statement: Node,
  { items: pruned, refs }: Pruned,
  live: LivenessView,
  scopeOf: ScopeOf,
): void {
  if (statement.type !== 'VariableDeclaration') {
    return
  }
  const code = ctx.analysis.source.code
  const decls = statement.declarations as ReadonlyArray<Node>
  const gone = (d: Node) => pruned.has(d) || live.isErased(rangeOf(d))
  const scope = scopeOf(refs, goneBefore(decls, pruned, live))
  if (decls.every(gone)) {
    const stmtParent = ctx.analysis.file.parentOf(statement)
    const asStatement =
      stmtParent !== null &&
      (stmtParent.type === 'BlockStatement' ||
        stmtParent.type === 'Program' ||
        stmtParent.type === 'SwitchCase' ||
        stmtParent.type === 'StaticBlock')
    if (asStatement) {
      ctx.rewrites.add({
        range: {
          start: statement.start,
          end: extendOverTrailingLine(code, statement.end),
        },
        body: [],
        scope,
        by: BY,
      })
      return
    }
  }
  // a declaration that is no statement (`for (const a = 1, b = 2;;)`) keeps
  // its last declarator so the syntax stays
  const last = decls[decls.length - 1]!
  const keepLast = decls.every(gone)
  const isGone = (d: Node) => gone(d) && !(keepLast && d === last)
  removeListItems(ctx, decls, isGone, pruned, null, { scope, by: BY })
}

/** The ranges of the items of a list an earlier erasure removed (what a removal of their run encloses). */
function goneBefore(
  items: ReadonlyArray<Node>,
  pruned: ReadonlySet<Node>,
  live: LivenessView,
): Array<Range> {
  return items
    .filter((item) => !pruned.has(item) && live.isErased(rangeOf(item)))
    .map(rangeOf)
}

/**
 * Removes the properties `pruned` of an object pattern (`removeListItems`;
 * a pattern losing every property becomes `{}`).
 */
function removePatternProperties(
  ctx: PlanContext,
  pattern: Node,
  { items: pruned, refs }: Pruned,
  live: LivenessView,
  scopeOf: ScopeOf,
): void {
  if (pattern.type !== 'ObjectPattern') {
    return
  }
  const props = pattern.properties as ReadonlyArray<Node>
  const gone = (p: Node) => pruned.has(p) || live.isErased(rangeOf(p))
  // the pattern's own `}` (its range covers a type annotation): past the
  // last property, a trailing comma and the comments
  const code = ctx.analysis.source.code
  let closing = nextToken(code, props[props.length - 1]!.end)
  if (code[closing] === ',') {
    closing = nextToken(code, closing + 1)
  }
  removeListItems(ctx, props, gone, pruned, closing, {
    scope: scopeOf(refs, goneBefore(props, pruned, live)),
    by: BY,
  })
}

/**
 * Removes the gone items of a comma-separated list (declarators, pattern or
 * object properties), computed from the list's final kept set: each run of
 * gone items (pruned now, or erased by an earlier round) holding one pruned
 * now is one range with the separator to its next kept item (or from its
 * previous one), so removals of neighbours never partially overlap and a
 * later round's run encloses the earlier one it grew from. When every item
 * is gone the range runs from the first item to `closing` (the list's
 * closing bracket, or `listEnd`), so a trailing comma goes too; a list
 * without a closing bracket never loses every item (its caller keeps one).
 * A planner removing items passes them as both `gone` and `pruned`.
 */
export function removeListItems(
  ctx: PlanContext,
  items: ReadonlyArray<Node>,
  gone: (item: Node) => boolean,
  pruned: ReadonlySet<Node>,
  closing: number | null,
  edit: { scope: EditScope; by: string },
): void {
  const prunedNow = (from: number, to: number) =>
    items.slice(from, to + 1).some((item) => pruned.has(item))
  if (closing !== null && items.every(gone)) {
    if (prunedNow(0, items.length - 1)) {
      ctx.rewrites.add({
        range: { start: items[0]!.start, end: closing },
        body: [],
        ...edit,
      })
    }
    return
  }
  for (let i = 0; i < items.length; i++) {
    if (!gone(items[i]!)) {
      continue
    }
    let j = i
    while (j + 1 < items.length && gone(items[j + 1]!)) {
      j++
    }
    if (prunedNow(i, j)) {
      const next = items[j + 1]
      const prev = items[i - 1]
      ctx.rewrites.add({
        range: next
          ? { start: items[i]!.start, end: next.start }
          : { start: prev!.end, end: items[j]!.end },
        body: [],
        ...edit,
      })
    }
    i = j
  }
}

/**
 * Whether an impure initialiser is server-only code the removal documents
 * (J4.12): it reads at least one import, and every import it reads has no
 * other live reference (the import leaves with it). Otherwise its effects
 * are kept as a statement (a call next to a removed implementation).
 */
function initReadsOnlyOrphanedImports(
  ctx: PlanContext,
  init: Node,
  live: LivenessView,
): boolean {
  const { t1, symbols } = ctx
  const range = rangeOf(init)
  let imports = 0
  for (const r of t1.refs.refsIn(range)) {
    if (!symbols.isImport(r.sym)) {
      continue
    }
    imports++
    const others = t1.refs
      .valueRefsOf(r.sym)
      .filter(
        (o) => !(o.range.start >= range.start && o.range.end <= range.end),
      )
    if (others.some((o) => live.live(o))) {
      return false
    }
  }
  return imports > 0
}

const HOOK_NAME = /^use[A-Z0-9_]/

/**
 * Whether an initialiser calls a hook (`useX(...)`, `ns.useX(...)`): a hook
 * call is never dropped, whatever it reads, so the hook order stays equal on
 * both sides (the call stays as a statement with its import).
 */
function callsHook(init: Node): boolean {
  let found = false
  walk(init, {
    enter: (n, wctx) => {
      if (n.type !== 'CallExpression') {
        return
      }
      const callee = n.callee
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression' &&
              !callee.computed &&
              callee.property.type === 'Identifier'
            ? callee.property.name
            : null
      if (name !== null && HOOK_NAME.test(name)) {
        found = true
        wctx.stop()
      }
    },
  })
  return found
}

/**
 * Removes a destructuring element whose binding only removed code read (its
 * default value or computed key may read server-only imports): an object
 * pattern property goes with its comma (never while the pattern keeps a
 * rest element, which would then receive the key); an object rest element
 * goes too, after which its siblings may; an array pattern element becomes
 * a hole (the iterator is stepped as often as before), and an array rest
 * element stays (it exhausts the iterator).
 */
function prunePatternElement(
  ctx: PlanContext,
  decl: Node,
  refs: ReadonlyArray<ClassifiedRef>,
  scopeOf: ScopeOf,
  prunedProps: Map<Node, Pruned>,
  live: LivenessView,
): boolean {
  const file = ctx.analysis.file
  let node: Node = decl
  let parent = file.parentOf(node)
  if (parent?.type === 'AssignmentPattern' && parent.left === node) {
    node = parent
    parent = file.parentOf(node)
  }
  if (!parent) {
    return false
  }
  if (parent.type === 'Property' || parent.type === 'RestElement') {
    const pattern = file.parentOf(parent)
    if (!pattern || pattern.type !== 'ObjectPattern') {
      return false
    }
    if (
      parent.type === 'Property' &&
      pattern.properties.some(
        (p) => p.type === 'RestElement' && !live.isErased(rangeOf(p)),
      )
    ) {
      return false
    }
    prune(prunedProps, pattern, parent, refs)
    return true
  }
  if (parent.type === 'ArrayPattern') {
    ctx.rewrites.add({
      range: { start: node.start, end: node.end },
      body: commaFollows(ctx.analysis.source.code, node.end) ? [] : [text(',')],
      scope: scopeOf(refs),
      by: BY,
    })
    return true
  }
  return false
}

/** Where a list ends: after its last item and the comma that may follow it (`closing` of `removeListItems`; `{ , }` is no syntax). */
export function listEnd(code: string, items: ReadonlyArray<Node>): number {
  const last = items[items.length - 1]!
  const next = nextToken(code, last.end)
  return code[next] === ',' ? next + 1 : last.end
}

/** Whether the next token after `pos` (past whitespace and comments) is a comma. */
function commaFollows(code: string, pos: number): boolean {
  return code[nextToken(code, pos)] === ','
}

/** The offset of the next token at or after `pos` (past whitespace and comments), or the end of the code. */
function nextToken(code: string, pos: number): number {
  let i = pos
  while (i < code.length) {
    const c = code[i]!
    if (/\s/.test(c)) {
      i++
    } else if (code.startsWith('//', i)) {
      const nl = code.slice(i).search(/[\n\r\u2028\u2029]/)
      i = nl === -1 ? code.length : i + nl
    } else if (code.startsWith('/*', i)) {
      const close = code.indexOf('*/', i + 2)
      i = close === -1 ? code.length : close + 2
    } else {
      break
    }
  }
  return i
}
