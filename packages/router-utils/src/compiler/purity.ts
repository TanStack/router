/**
 * Purity model: literals, function/class expressions without
 * decorators/static effects, pure object/array literals, all-literal
 * templates, `/*#__PURE__*\/` calls with pure arguments, calls with pure
 * arguments of `#__NO_SIDE_EFFECTS__` callee declarations and of the pure
 * exports of known packages (`RecognizerTable.pureCalls`, R79: by import
 * binding, namespace member or re-export), JSX with bound/intrinsic tags and
 * pure attributes and children. `import()` is impure. The same
 * classification yields Tier 0's `ownEffects` at statement granularity.
 */
import { unwrapExpression } from './source'
import type { ModuleAnalysis } from './analysis'
import type { ResolveOutcome } from './resolve'
import type {
  Comment,
  Expression,
  Node,
  Reference,
  SourceFile,
  Statement,
  VariableDeclarator,
} from 'yuku'

export interface PurityContext {
  file: SourceFile
  /** Comments sorted by start (the file's). */
  comments: ReadonlyArray<Comment>
  /**
   * Bindings (ids) of callees whose calls are pure when their arguments are:
   * declared with `#__NO_SIDE_EFFECTS__`, or imports of a pure export of a
   * known package (directly or through re-exports).
   */
  noSideEffectCallees: ReadonlySet<number>
  /** Namespace imports (binding ids) of known packages → their pure exports. */
  pureNamespaces: ReadonlyMap<number, ReadonlySet<string>>
}

const PURE_RE = /[@#]__PURE__/
const NSE_RE = /[@#]__NO_SIDE_EFFECTS__/

/** The comment ending right before `offset` (only whitespace between), if any. */
export function commentBefore(
  comments: ReadonlyArray<Comment>,
  code: string,
  offset: number,
): Comment | null {
  // binary search the last comment with end <= offset
  let lo = 0
  let hi = comments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (comments[mid]!.end <= offset) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found === -1) {
    return null
  }
  const c = comments[found]!
  for (let i = c.end; i < offset; i++) {
    const ch = code.charCodeAt(i)
    if (ch !== 32 && ch !== 9 && ch !== 10 && ch !== 13) {
      return null
    }
  }
  return c
}

export function hasPureAnnotation(ctx: PurityContext, node: Node): boolean {
  const c = commentBefore(ctx.comments, ctx.file.source, node.start)
  return c !== null && PURE_RE.test(c.value)
}

export function hasNoSideEffectsAnnotation(
  ctx: PurityContext,
  node: Node,
): boolean {
  const c = commentBefore(ctx.comments, ctx.file.source, node.start)
  return c !== null && NSE_RE.test(c.value)
}

export function isPrimitiveLiteral(node: Node): boolean {
  switch (node.type) {
    case 'Literal':
      // a regex literal is an object: its identity and `lastIndex` are state
      return !('regex' in node)
    case 'TemplateLiteral':
      return node.expressions.length === 0
    case 'UnaryExpression':
      return (
        (node.operator === '-' ||
          node.operator === '+' ||
          node.operator === '!' ||
          node.operator === 'void') &&
        isPrimitiveLiteral(node.argument)
      )
    case 'Identifier':
      return node.name === 'undefined'
    default:
      return false
  }
}

export function isPureExpression(
  ctx: PurityContext,
  expr: Node | null,
): boolean {
  if (expr === null) {
    return true
  }
  const node = unwrapExpression(expr)
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
    case 'ThisExpression':
    case 'MetaProperty':
    case 'ArrowFunctionExpression':
      return true
    case 'FunctionExpression':
      return true
    case 'ClassExpression':
      return isPureClass(ctx, node)
    case 'TemplateLiteral':
      return node.expressions.every((e) => isPureExpression(ctx, e))
    case 'ArrayExpression':
      return node.elements.every(
        (e) =>
          e === null ||
          (e.type === 'SpreadElement'
            ? unwrapExpression(e.argument).type === 'ArrayExpression' &&
              isPureExpression(ctx, e.argument)
            : isPureExpression(ctx, e)),
      )
    case 'ObjectExpression':
      return node.properties.every((p) => {
        if (p.type === 'SpreadElement') {
          return (
            unwrapExpression(p.argument).type === 'ObjectExpression' &&
            isPureExpression(ctx, p.argument)
          )
        }
        if (p.computed && !isPureExpression(ctx, p.key as Node)) {
          return false
        }
        if (p.kind !== 'init') {
          return true
        }
        return isPureExpression(ctx, p.value)
      })
    case 'UnaryExpression':
      return node.operator !== 'delete' && isPureExpression(ctx, node.argument)
    case 'BinaryExpression':
      return (
        node.operator !== 'in' &&
        node.operator !== 'instanceof' &&
        isPureExpression(ctx, node.left) &&
        isPureExpression(ctx, node.right)
      )
    case 'LogicalExpression':
      return (
        isPureExpression(ctx, node.left) && isPureExpression(ctx, node.right)
      )
    case 'ConditionalExpression':
      return (
        isPureExpression(ctx, node.test) &&
        isPureExpression(ctx, node.consequent) &&
        isPureExpression(ctx, node.alternate)
      )
    case 'SequenceExpression':
      return node.expressions.every((e) => isPureExpression(ctx, e))
    case 'CallExpression':
    case 'NewExpression': {
      if (hasPureAnnotation(ctx, node) || hasPureAnnotation(ctx, expr)) {
        return node.arguments.every((a) =>
          a.type === 'SpreadElement' ? false : isPureExpression(ctx, a),
        )
      }
      if (
        node.type === 'CallExpression' &&
        isPureCallee(ctx, unwrapExpression(node.callee))
      ) {
        return node.arguments.every((a) =>
          a.type === 'SpreadElement' ? false : isPureExpression(ctx, a),
        )
      }
      return false
    }
    case 'JSXElement': {
      const name = node.openingElement.name
      if (name.type === 'JSXNamespacedName') {
        return false
      }
      if (name.type === 'JSXIdentifier') {
        const c = name.name.charCodeAt(0)
        const intrinsic = c >= 97 && c <= 122
        if (!intrinsic && !ctx.file.referenceOf(name)?.binding) {
          return false
        }
      }
      return (
        node.openingElement.attributes.every((a) =>
          a.type === 'JSXSpreadAttribute'
            ? false
            : a.value === null ||
                a.value.type === 'Literal' ||
                a.value.type === 'JSXElement' ||
                a.value.type === 'JSXFragment'
              ? a.value === null || isPureExpression(ctx, a.value)
              : a.value.expression.type === 'JSXEmptyExpression' ||
                isPureExpression(ctx, a.value.expression),
        ) && node.children.every((ch) => isPureJsxChild(ctx, ch))
      )
    }
    case 'JSXFragment':
      return node.children.every((ch) => isPureJsxChild(ctx, ch))
    case 'MemberExpression':
    case 'ChainExpression':
    case 'TaggedTemplateExpression':
    case 'ImportExpression':
    case 'AwaitExpression':
    case 'YieldExpression':
    case 'AssignmentExpression':
    case 'UpdateExpression':
    case 'Super':
    default:
      return false
  }
}

/** Whether a callee's calls are pure when their arguments are (`noSideEffectCallees`, `pureNamespaces`). */
function isPureCallee(ctx: PurityContext, callee: Node): boolean {
  if (callee.type === 'Identifier') {
    if (ctx.noSideEffectCallees.size === 0) {
      return false
    }
    const b = ctx.file.referenceOf(callee)?.binding
    return b !== undefined && b !== null && ctx.noSideEffectCallees.has(b.id)
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    ctx.pureNamespaces.size > 0
  ) {
    const object = unwrapExpression(callee.object as Node)
    if (object.type !== 'Identifier') {
      return false
    }
    const b = ctx.file.referenceOf(object)?.binding
    return (
      b !== undefined &&
      b !== null &&
      ctx.pureNamespaces.get(b.id)?.has(callee.property.name) === true
    )
  }
  return false
}

function isPureJsxChild(ctx: PurityContext, ch: Node): boolean {
  switch (ch.type) {
    case 'JSXText':
      return true
    case 'JSXElement':
    case 'JSXFragment':
      return isPureExpression(ctx, ch)
    case 'JSXExpressionContainer':
      return (
        ch.expression.type === 'JSXEmptyExpression' ||
        isPureExpression(ctx, ch.expression)
      )
    default:
      return false
  }
}

export function isPureClass(
  ctx: PurityContext,
  node: Extract<Node, { type: 'ClassDeclaration' | 'ClassExpression' }>,
): boolean {
  if (node.decorators.length > 0) {
    return false
  }
  if (node.superClass !== null) {
    const sc = unwrapExpression(node.superClass)
    if (sc.type !== 'Identifier') {
      return false
    }
  }
  for (const el of node.body.body) {
    switch (el.type) {
      case 'StaticBlock':
        return false
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (el.decorators.length > 0) {
          return false
        }
        if (el.computed && !isPureExpression(ctx, el.key as Node)) {
          return false
        }
        if (el.static && !isPureExpression(ctx, el.value)) {
          return false
        }
        break
      case 'MethodDefinition':
        if (el.decorators.length > 0) {
          return false
        }
        if (el.computed && !isPureExpression(ctx, el.key as Node)) {
          return false
        }
        break
      default:
        break
    }
  }
  return true
}

export function isPureDeclarator(
  ctx: PurityContext,
  d: VariableDeclarator,
): boolean {
  return d.init === null || isPureExpression(ctx, d.init)
}

/** Whether a top-level statement has effects at module evaluation (the J6 effect scan). */
export function statementHasEffects(
  ctx: PurityContext,
  stmt: Statement | Node,
): boolean {
  switch (stmt.type) {
    case 'ImportDeclaration':
      return stmt.specifiers.length === 0 && stmt.importKind !== 'type'
    case 'ExportAllDeclaration':
      return stmt.exportKind !== 'type'
    case 'ExportNamedDeclaration':
      if (stmt.source !== null) {
        return stmt.exportKind !== 'type'
      }
      return stmt.declaration === null
        ? false
        : statementHasEffects(ctx, stmt.declaration)
    case 'ExportDefaultDeclaration':
      return statementHasEffects(ctx, stmt.declaration)
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSImportEqualsDeclaration':
    case 'EmptyStatement':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return false
    case 'TSEnumDeclaration':
      return false
    case 'ClassDeclaration':
    case 'ClassExpression':
      return !isPureClass(ctx, stmt)
    case 'VariableDeclaration':
      return stmt.declarations.some((d) => !isPureDeclarator(ctx, d))
    case 'TSModuleDeclaration':
      return (
        !stmt.declare &&
        stmt.body !== undefined &&
        stmt.body.body.some((s) => statementHasEffects(ctx, s))
      )
    case 'ExpressionStatement':
      return !isPureExpression(ctx, stmt.expression)
    default:
      // if/for/try/… and any expression used as `export default <expr>`
      return !(
        isExpressionNode(stmt) && isPureExpression(ctx, stmt as Expression)
      )
  }
}

function isExpressionNode(n: Node): boolean {
  switch (n.type) {
    case 'Literal':
    case 'Identifier':
    case 'ThisExpression':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ClassExpression':
    case 'TaggedTemplateExpression':
    case 'TemplateLiteral':
    case 'MemberExpression':
    case 'CallExpression':
    case 'NewExpression':
    case 'ChainExpression':
    case 'SequenceExpression':
    case 'ParenthesizedExpression':
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'ConditionalExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
    case 'AssignmentExpression':
    case 'YieldExpression':
    case 'AwaitExpression':
    case 'ImportExpression':
    case 'MetaProperty':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
    case 'JSXElement':
    case 'JSXFragment':
      return true
    default:
      return false
  }
}

const NODE_MODULES_RE = /[\\/]node_modules[\\/]/

export interface PureImportDeps {
  /** Resolves a specifier from a module to a canonical id (records the resolution). */
  resolveFrom: (specifier: string, importer: string) => Promise<string | null>
  /** Resolves an export through re-exports over summaries (records them). */
  resolveExport: (canonicalId: string, name: string) => Promise<ResolveOutcome>
  isKnownSpecifier: (specifier: string) => boolean
  isPureCall: (specifier: string, name: string) => boolean
}

/**
 * Phase A of the purity model (R79): an import of a project module that the
 * module calls at its evaluation joins its pure callees when it resolves,
 * through re-exports, to a known package's pure export (an import of the
 * known package itself is recognised by Tier 0). Packages are never read for
 * it: a third party's purity is never assumed. Runs before Tier 1 classifies
 * the units.
 */
export async function seedPureImports(
  t0: ModuleAnalysis,
  importer: string,
  deps: PureImportDeps,
): Promise<void> {
  const file = t0.file
  const callees = t0.purity.noSideEffectCallees as Set<number>
  const pureExport = async (
    canonicalId: string,
    name: string,
  ): Promise<boolean> => {
    // a local export of an import (`import { f } from …; export { f }`) is a
    // symbolic reference to follow; bounded like any re-export chain
    for (let hop = 0; hop < 16; hop++) {
      if (NODE_MODULES_RE.test(canonicalId)) {
        return false
      }
      const outcome = await deps.resolveExport(canonicalId, name)
      if (outcome.k !== 'found') {
        return false
      }
      if (outcome.noSideEffects) {
        return true
      }
      const v = outcome.value
      if (v.t !== 'importRef') {
        return false
      }
      if (deps.isKnownSpecifier(v.specifier)) {
        return deps.isPureCall(v.specifier, v.name)
      }
      const next = await deps.resolveFrom(
        v.specifier,
        outcome.origin.canonicalId,
      )
      if (next === null) {
        return false
      }
      canonicalId = next
      name = v.name
    }
    return false
  }
  const work: Array<Promise<void>> = []
  for (const imp of t0.imports) {
    if (imp.typeOnly || imp.bare || deps.isKnownSpecifier(imp.specifier)) {
      continue
    }
    for (const spec of imp.specifiers) {
      if (spec.typeOnly || spec.imported === '*' || spec.local < 0) {
        continue
      }
      const binding = file.bindings[spec.local]
      if (
        !binding ||
        !binding.references.some((r) => calledAtEvaluation(file, r))
      ) {
        continue
      }
      work.push(
        (async () => {
          const target = await deps.resolveFrom(imp.specifier, importer)
          if (target !== null && (await pureExport(target, spec.imported))) {
            callees.add(spec.local)
          }
        })(),
      )
    }
  }
  await Promise.all(work)
}

/** Whether a reference is the callee of a call the module evaluates when it loads (in no function). */
function calledAtEvaluation(file: SourceFile, r: Reference): boolean {
  if (r.inTypePosition || r.scope !== file.rootScope) {
    return false
  }
  const parent = file.parentOf(r.node)
  return (
    parent !== null &&
    parent.type === 'CallExpression' &&
    unwrapExpression(parent.callee).start === r.node.start
  )
}
