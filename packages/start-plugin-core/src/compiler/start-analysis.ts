/**
 * Start candidates of one module: the value analysis
 * over the module's bindings (imports resolved by `prefetch.ts`) and the
 * candidates enumerated from every Start-valued binding by climbing its
 * references through call and member chains (`parentOf`, never a walk).
 *
 * Every place a climb ends is classified: a position the analysis follows
 * (a chain link, a binding, a join, a function's return, an export the
 * summaries follow), a use as data, or an escape, where a value server code
 * can still be attached to (`takesServerCode`) goes where the compiler
 * cannot follow it. The client fails at an escape that ships.
 *
 * One analysis per plan, shared by the `start-env` and `rsc-css` planners.
 */
import {
  UNKNOWN,
  ValueAnalysis,
  isExpressionWrapper,
  isKnownSpecifier,
  recognizeImport,
} from '@tanstack/router-utils/compiler'
import { START_KINDS } from './recognizer'
import {
  importResolverOf,
  isPlainRead,
  isStartValue,
  takesServerCode,
} from './prefetch'
import type { StartPrefetch } from './prefetch'
import type {
  AbstractValue,
  ModuleAnalysis,
  YukuNode as Node,
  PlanContext,
  RecognizerTable,
} from '@tanstack/router-utils/compiler'

type CallNode = Extract<Node, { type: 'CallExpression' }>
type MemberNode = Extract<Node, { type: 'MemberExpression' }>
type JsxElementNode = Extract<Node, { type: 'JSXElement' }>

interface ChainLink {
  method: string
  call: CallNode
  member: MemberNode
  /** The receiver's value before this link. */
  receiver: AbstractValue
  /** The first argument (null when absent). */
  arg: Node | null
  argIsSpread: boolean
}

export interface Chain {
  /** The node the segment starts at in this module: a factory call or a reference to a stored value. */
  head: Node
  headIsFactoryCall: boolean
  links: Array<ChainLink>
  /** The outermost call/member node of the segment (wrappers excluded). */
  terminal: Node
  terminalValue: AbstractValue
  /** The terminal with its enclosing wrappers (parens, TS assertions, optional chain). */
  wrapped: Node
  /** The parent of `wrapped`. */
  parent: Node | null
  /** The chain ends at a computed member (an unsupported use): left to the runtime, an error where it may leak. */
  unsupported: boolean
}

interface EnvOnlyCall {
  call: CallNode
  kind: 'server' | 'client'
  arg: Node | null
}

interface RscCall {
  call: CallNode
  kind: 'rsc:render' | 'rsc:composite' | 'rsc:stream'
}

/**
 * Why a value server code can still be attached to escapes: `flow` (passed
 * to unknown code, stored in a container, a class field or an assignment,
 * awaited, rendered…), `member` (a detached or unknown member of a builder,
 * a method of a factory), `computed` (a computed member: the chain is left to
 * the runtime), `return` (from a function the domain cannot summarise:
 * control flow, async, a generator, a method), `reassigned` (a written
 * binding), `pattern` (destructured, other than a namespace's or a start
 * instance's factories).
 */
export type EscapeReason =
  | 'flow'
  | 'member'
  | 'computed'
  | 'return'
  | 'reassigned'
  | 'pattern'

export interface Escape {
  node: Node
  reason: EscapeReason
  value: AbstractValue
}

export interface StartAnalysis {
  chains: Array<Chain>
  envOnlyCalls: Array<EnvOnlyCall>
  clientOnlyElements: Array<JsxElementNode>
  rscCalls: Array<RscCall>
  escapes: Array<Escape>
}

const cache = new WeakMap<ModuleAnalysis, StartAnalysis>()

function isRscKind(kind: string): kind is RscCall['kind'] {
  return (
    kind === START_KINDS.rscRender ||
    kind === START_KINDS.rscComposite ||
    kind === START_KINDS.rscStream
  )
}

export function isFunctionNode(n: Node): n is Extract<
  Node,
  {
    type:
      | 'ArrowFunctionExpression'
      | 'FunctionExpression'
      | 'FunctionDeclaration'
  }
> {
  return (
    n.type === 'ArrowFunctionExpression' ||
    n.type === 'FunctionExpression' ||
    n.type === 'FunctionDeclaration'
  )
}

/**
 * The Start analysis of a plan: computed once per compile attempt.
 */
export function startAnalysisOf(
  ctx: Pick<PlanContext, 'analysis' | 'symbols' | 'prefetched'>,
  table: RecognizerTable,
): StartAnalysis {
  const hit = cache.get(ctx.analysis)
  if (hit) {
    return hit
  }
  // (rsc-css reads start-env's prefetch: both planners run where the Start compiler does)
  const prefetch = ctx.prefetched.get('start-env') as StartPrefetch | undefined
  const file = ctx.analysis.file
  const values = new ValueAnalysis(file, {
    table,
    resolveImport: importResolverOf(prefetch),
    // (the map, not the analysis: `cache` is keyed by the analysis, and a
    // value referring to its key keeps both alive until a full GC)
    declarations: ctx.analysis.declarations,
  })
  const result: StartAnalysis = {
    chains: [],
    envOnlyCalls: [],
    clientOnlyElements: [],
    rscCalls: [],
    escapes: [],
  }
  const parentOf = (n: Node) => file.parentOf(n)
  const seenTerminal = new Set<Node>()
  const seenEnvOnly = new Set<Node>()
  const seenJsx = new Set<Node>()
  const seenRsc = new Set<Node>()
  const queued = new Set<number>()
  const queue: Array<number> = []

  const enqueueBinding = (bindingId: number) => {
    if (queued.has(bindingId)) {
      return
    }
    queued.add(bindingId)
    queue.push(bindingId)
  }

  const memberName = (m: MemberNode): string | null =>
    !m.computed && m.property.type === 'Identifier' ? m.property.name : null

  /** Values a segment hands on to a new segment (a join, a function expression returning it). */
  const handoffs: Array<[Node, AbstractValue]> = []
  const handedOff = new Set<Node>()
  const handoff = (n: Node, v: AbstractValue) => {
    if (!handedOff.has(n)) {
      handedOff.add(n)
      handoffs.push([n, v])
    }
  }

  const escaped = new Set<Node>()
  const escape = (node: Node, value: AbstractValue, reason: EscapeReason) => {
    if (takesServerCode(table, value) && !escaped.has(node)) {
      escaped.add(node)
      result.escapes.push({ node, reason, value })
    }
  }

  const enclosingFunction = (n: Node): Node | null => {
    for (const a of file.ancestors(n)) {
      if (isFunctionNode(a)) {
        return a
      }
    }
    return null
  }

  /** A function whose value is a method, a getter or a setter of an object or class. */
  const isMethod = (fn: Node): boolean => {
    const p = parentOf(fn)
    return (
      p !== null &&
      (p.type === 'MethodDefinition' ||
        (p.type === 'Property' &&
          p.value === fn &&
          (p.method || p.kind !== 'init')))
    )
  }

  /** A Start call handing back what its argument returns: `createClientOnlyFn` and an isomorphic fn's implementations. */
  const handsBack = (call: CallNode): boolean => {
    const v = values.valueOf(call.callee)
    return v.t === 'factory'
      ? table.envOnlyKinds[v.kind] === 'client'
      : v.t === 'member' &&
          (v.object.t === 'isoFn' ||
            (v.object.t === 'builder' &&
              table.terminal[v.object.kind] === 'isoFn'))
  }

  /** A call whose arguments Start's runtime consumes as data: a factory's, or a builder's or start instance's method. */
  const isStartSink = (call: CallNode): boolean => {
    const v = values.valueOf(call.callee)
    return (
      !handsBack(call) &&
      (v.t === 'factory' ||
        (v.t === 'member' &&
          (v.object.t === 'builder' ||
            v.object.t === 'isoFn' ||
            v.object.t === 'startInstance')))
    )
  }

  /** A TS namespace's export is a property of the namespace, read by no reference. */
  const isNamespaceExport = (declaration: Node | null): boolean => {
    const e = declaration && parentOf(declaration)
    return (
      e?.type === 'ExportNamedDeclaration' &&
      parentOf(e)?.type === 'TSModuleBlock'
    )
  }

  /**
   * Whether a value inside array and object literals, a join of them (and
   * the function returning them, or a `const` list only such uses read)
   * reaches a Start call's argument: `.middleware([mw])`, `.middleware(common)`,
   * `createStart(() => ({ functionMiddleware: [mw] }))`.
   */
  const reachesStartSink = (from: Node, seen = new Set<Node>()): boolean => {
    let n: Node = from
    for (let p = parentOf(n); p; p = parentOf(n)) {
      if (
        isExpressionWrapper(p) ||
        p.type === 'ArrayExpression' ||
        p.type === 'ObjectExpression' ||
        p.type === 'SpreadElement' ||
        p.type === 'LogicalExpression' ||
        (p.type === 'ConditionalExpression' && p.test !== n) ||
        (p.type === 'Property' && p.value === n && p.kind === 'init') ||
        (p.type === 'ArrowFunctionExpression' && p.body === n)
      ) {
        n = p
      } else if (p.type === 'ReturnStatement') {
        const fn = enclosingFunction(p)
        if (!fn || fn.type === 'FunctionDeclaration') {
          return false
        }
        n = fn
      } else if (p.type === 'VariableDeclarator') {
        return constListReachesSink(p, seen)
      } else {
        return p.type === 'CallExpression' && p.callee !== n && isStartSink(p)
      }
    }
    return false
  }

  /** Whether every read of the unexported `const` that `declarator` declares reaches a Start call's argument. */
  const constListReachesSink = (
    declarator: Extract<Node, { type: 'VariableDeclarator' }>,
    seen: Set<Node>,
  ): boolean => {
    const declaration = parentOf(declarator)
    const b =
      declarator.id.type === 'Identifier' ? file.bindingOf(declarator.id) : null
    if (
      !b ||
      declaration?.type !== 'VariableDeclaration' ||
      declaration.kind !== 'const' ||
      parentOf(declaration)?.type === 'ExportNamedDeclaration'
    ) {
      return false
    }
    // (judged at its first visit)
    if (seen.has(declarator)) {
      return true
    }
    seen.add(declarator)
    return b.references.every(
      (r) => r.inTypePosition || reachesStartSink(r.node, seen),
    )
  }

  const jsxCandidate = (opening: Node) => {
    const element = parentOf(opening)
    if (element && element.type === 'JSXElement' && !seenJsx.has(element)) {
      seenJsx.add(element)
      result.clientOnlyElements.push(element)
    }
  }

  /** Where a value is consumed as data (`outer` in `p`): nothing attaches code to it there. */
  const isDataUse = (p: Node, outer: Node, value: AbstractValue): boolean => {
    switch (p.type) {
      case 'CallExpression':
        // a callee is a use (a server fn called); an argument a Start call
        // consumes is data; so is an open middleware an implementation returns
        return (
          p.callee === outer ||
          isStartSink(p) ||
          isPlainRead(file, p, outer) ||
          (handsBack(p) &&
            value.t === 'function' &&
            value.returns.t === 'builder' &&
            table.terminal[value.returns.kind] === 'middleware')
        )
      case 'ArrayExpression':
      case 'SpreadElement':
      case 'Property':
        return reachesStartSink(outer)
      default:
        return isPlainRead(file, p, outer)
    }
  }

  /** Whether `value` is the same kind of builder as the binding plain assignment `write` writes. */
  const isSameBuilder = (
    write: Extract<Node, { type: 'AssignmentExpression' }>,
    value: AbstractValue,
  ): boolean => {
    const target = values.valueOf(write.left)
    return (
      write.operator === '=' &&
      target.t === 'builder' &&
      takesServerCode(table, target) &&
      value.t === 'builder' &&
      value.kind === target.kind
    )
  }

  /**
   * Classifies the position a segment's value `outer` ends in, `p` its
   * parent: followed (a binding, a join or a function's return starts a new
   * segment; an export, which summaries follow), a use as data, or an
   * escape.
   */
  const settle = (p: Node, outer: Node, value: AbstractValue) => {
    switch (p.type) {
      case 'MemberExpression': // a member the climb judged
      case 'ExportDefaultDeclaration':
      case 'ExportSpecifier': // summaries follow exports
        return
      case 'AssignmentExpression':
        if (
          p.right === outer &&
          parentOf(p)?.type === 'ExpressionStatement' &&
          isSameBuilder(p, value)
        ) {
          return
        }
        break
      case 'ConditionalExpression':
      case 'LogicalExpression': {
        if (p.type === 'ConditionalExpression' && p.test === outer) {
          return
        }
        // a join: each branch keeps its own links (and edits), the joined value starts a new segment
        const joined = values.valueOf(p)
        if (isStartValue(table, joined)) {
          handoff(p, joined)
        } else {
          escape(outer, value, 'flow')
        }
        return
      }
      case 'ReturnStatement':
      case 'ArrowFunctionExpression': {
        const fn = p.type === 'ReturnStatement' ? enclosingFunction(p) : p
        if (fn === null || isMethod(fn)) {
          escape(outer, value, 'return')
          return
        }
        const binding =
          fn.type === 'FunctionDeclaration' && fn.id
            ? file.bindingOf(fn.id)
            : null
        const fv =
          fn.type === 'FunctionDeclaration'
            ? binding
              ? values.valueOfBinding(binding.id)
              : UNKNOWN
            : values.valueOf(fn)
        if (
          fv.t !== 'function' ||
          !isStartValue(table, fv.returns) ||
          isNamespaceExport(fn)
        ) {
          // the function's value does not carry what it returns
          escape(outer, value, 'return')
        } else if (binding) {
          enqueueBinding(binding.id)
        } else {
          handoff(fn, fv)
        }
        return
      }
      case 'VariableDeclarator':
        if (p.init !== outer) {
          return
        }
        if (p.id.type === 'Identifier') {
          if (isNamespaceExport(parentOf(p))) {
            escape(outer, value, 'flow')
            return
          }
          const b = file.bindingOf(p.id)
          if (b && isStartValue(table, value)) {
            // (`var a = 1; var a = createServerFn()`: the name's value is the first)
            const first = b.declarations.find((d) => {
              const q = parentOf(d)
              return q?.type === 'VariableDeclarator' && q.init !== null
            })
            if (first?.start === p.id.start) {
              enqueueBinding(b.id)
            } else {
              escape(outer, value, 'reassigned')
            }
          }
          return
        }
        if (
          p.id.type === 'ObjectPattern' &&
          (value.t === 'namespace' || value.t === 'startInstance')
        ) {
          // `const { createServerFn } = Start`: each destructured binding at any scope
          for (const prop of p.id.properties) {
            if (prop.type !== 'Property' || prop.value.type !== 'Identifier') {
              // a rest element, a default, a nested pattern
              escape(prop, value, 'pattern')
              continue
            }
            const b = file.bindingOf(prop.value)
            if (b && isStartValue(table, values.valueOfBinding(b.id))) {
              enqueueBinding(b.id)
            } else if (prop.computed) {
              escape(prop, value, 'pattern')
            }
          }
          return
        }
        escape(p.id, value, 'pattern')
        return
    }
    if (takesServerCode(table, value) && !isDataUse(p, outer, value)) {
      escape(outer, value, 'flow')
    }
  }

  /** Climbs from a reference node with a known value. */
  const climb = (start: Node, startValue: AbstractValue) => {
    const links: Array<ChainLink> = []
    let unsupported = false
    let node: Node = start
    let value = startValue
    let head: Node = start
    let headIsFactoryCall = false
    let outer: Node = node
    let p: Node | null = null
    for (;;) {
      outer = node
      p = parentOf(outer)
      while (p && isExpressionWrapper(p)) {
        outer = p
        p = parentOf(p)
      }
      if (!p) {
        break
      }
      if (p.type === 'CallExpression' && p.callee === outer) {
        const call = p
        if (value.t === 'factory') {
          const kind = value.kind
          const envOnly = table.envOnlyKinds[kind]
          if (envOnly) {
            if (!seenEnvOnly.has(call)) {
              seenEnvOnly.add(call)
              const arg = call.arguments[0] ?? null
              result.envOnlyCalls.push({ call, kind: envOnly, arg })
            }
            return
          }
          if (isRscKind(kind)) {
            if (!seenRsc.has(call)) {
              seenRsc.add(call)
              result.rscCalls.push({ call, kind })
            }
            return
          }
          if (kind === START_KINDS.clientOnlyJsx) {
            return
          }
          const v2 = values.valueOf(call)
          if (v2.t === 'unknown') {
            escape(call, value, 'flow')
            return
          }
          if (links.length === 0) {
            head = call
            headIsFactoryCall = true
          }
          node = call
          value = v2
          continue
        }
        if (value.t === 'builder' || value.t === 'function') {
          const v2 = values.valueOf(call)
          if (v2.t === 'unknown' || !isStartValue(table, v2)) {
            escape(call, value, 'flow')
            return
          }
          node = call
          value = v2
          continue
        }
        // calling a server fn, an isomorphic fn or an env-only result (a use as data): the chain ends here
        break
      }
      if (p.type === 'MemberExpression' && p.object === outer) {
        const member = p
        if (member.computed) {
          unsupported = takesServerCode(table, value)
          escape(member, value, 'computed')
          break
        }
        const name = memberName(member)
        if (name === null) {
          escape(member, value, 'member')
          return
        }
        let mOuter: Node = member
        let pp = parentOf(member)
        while (pp && isExpressionWrapper(pp)) {
          mOuter = pp
          pp = parentOf(pp)
        }
        if (pp && pp.type === 'CallExpression' && pp.callee === mOuter) {
          const call = pp
          if (value.t === 'builder' || value.t === 'isoFn') {
            const v2 = values.valueOf(call)
            const arg = call.arguments[0] ?? null
            links.push({
              method: name,
              call,
              member,
              receiver: value,
              arg,
              argIsSpread: arg?.type === 'SpreadElement',
            })
            if (v2.t === 'unknown') {
              // an unrecognised method on a builder (`.url()`?): the chain ends here
              links.pop()
              escape(member, value, 'member')
              break
            }
            node = call
            value = v2
            continue
          }
          if (
            value.t === 'namespace' ||
            value.t === 'startInstance' ||
            value.t === 'factory'
          ) {
            const mv = values.valueOf(member)
            if (isStartValue(table, mv)) {
              node = member
              value = mv
              continue
            }
            if (value.t !== 'factory') {
              // another export of the package, another member of the instance: a plain call
              return
            }
          }
          // a method of a factory or of a finished value (`.call`, `.bind`)
          escape(member, value, 'member')
          break
        }
        // a member read that is not called (a namespace read through a namespace too)
        const mv = values.valueOf(member)
        if (isStartValue(table, mv) || mv.t === 'namespace') {
          node = member
          value = mv
          continue
        }
        if (value.t !== 'namespace' && value.t !== 'startInstance') {
          // a detached method (`.handler`), a property of a builder
          escape(member, value, 'member')
        }
        break
      }
      if (
        p.type === 'JSXMemberExpression' &&
        p.object === outer &&
        value.t === 'namespace'
      ) {
        const mv = isKnownSpecifier(table, value.specifier)
          ? recognizeImport(table, value.specifier, p.property.name)
          : importResolverOf(prefetch)(value.specifier, p.property.name)
        if (mv.t === 'factory' && mv.kind === START_KINDS.clientOnlyJsx) {
          const opening = parentOf(p)
          if (
            opening &&
            opening.type === 'JSXOpeningElement' &&
            opening.name === p
          ) {
            jsxCandidate(opening)
          }
        }
        return
      }
      if (p.type === 'SequenceExpression') {
        if (p.expressions[p.expressions.length - 1] !== outer) {
          // a discarded operand
          return
        }
        node = p
        continue
      }
      break
    }
    // the segment ends: where its value goes
    if (p) {
      settle(p, outer, value)
    }
    if (links.length === 0 && !headIsFactoryCall) {
      return
    }
    if (seenTerminal.has(node)) {
      return
    }
    seenTerminal.add(node)
    result.chains.push({
      head,
      headIsFactoryCall,
      links,
      terminal: node,
      terminalValue: value,
      wrapped: outer,
      parent: p,
      unsupported,
    })
  }

  /** Whether a namespace of a project module has a member with a Start value (phase A), maybe through a namespace. */
  const namespaceHasStartMember = (
    specifier: string,
    seen = new Set<string>(),
  ): boolean => {
    if (!prefetch || seen.has(specifier)) {
      return false
    }
    seen.add(specifier)
    const prefix = `${specifier}\u0000`
    for (const [k, v] of prefetch.values) {
      if (
        k.startsWith(prefix) &&
        (isStartValue(table, v) ||
          (v.t === 'namespace' && namespaceHasStartMember(v.specifier, seen)))
      ) {
        return true
      }
    }
    return false
  }
  // seeds: imports with Start values, module-level bindings with Start values
  for (const b of file.bindings) {
    if (b.scope !== file.rootScope) {
      continue
    }
    const v = values.valueOfBinding(b.id)
    if (
      !isStartValue(table, v) &&
      !(v.t === 'namespace' && namespaceHasStartMember(v.specifier))
    ) {
      continue
    }
    enqueueBinding(b.id)
  }
  while (queue.length > 0) {
    const id = queue.shift()!
    const b = file.bindings[id]
    if (!b) {
      continue
    }
    const v = values.valueOfBinding(id)
    for (const ref of b.references) {
      if (ref.inTypePosition) {
        continue
      }
      if (ref.isWrite) {
        // the binding's value is its initialiser's only while nothing writes it,
        // or only the same kind of builder does
        const write = parentOf(ref.node)
        if (
          write?.type !== 'AssignmentExpression' ||
          write.left !== ref.node ||
          !isSameBuilder(write, values.valueOf(write.right))
        ) {
          escape(ref.node, v, 'reassigned')
        }
        continue
      }
      const n = ref.node
      if (n.type === 'JSXIdentifier') {
        if (v.t === 'factory' && v.kind === START_KINDS.clientOnlyJsx) {
          const opening = parentOf(n)
          if (
            opening &&
            opening.type === 'JSXOpeningElement' &&
            opening.name === n
          ) {
            jsxCandidate(opening)
          }
        } else if (v.t === 'namespace') {
          climb(n, v)
        }
        continue
      }
      climb(n, v)
    }
    while (handoffs.length > 0) {
      const [n, v] = handoffs.shift()!
      climb(n, v)
    }
  }
  cache.set(ctx.analysis, result)
  return result
}
