/**
 * Start candidates of one module (DESIGN §3.10.2–§3.10.3): the value analysis
 * over the module's bindings (imports resolved by `prefetch.ts`) and the
 * candidates enumerated from every Start-valued binding by climbing its
 * references through call and member chains (`parentOf`, never a walk).
 *
 * One analysis per plan, shared by the `start-env` and `rsc-css` planners.
 */
import {
  ValueAnalysis,
  isKnownSpecifier,
  recognizeImport,
} from '@tanstack/router-utils/compiler'
import { START_KINDS } from './recognizer'
import { importResolverOf, isStartValue } from './prefetch'
import type { StartPrefetch } from './prefetch'
import type {
  AbstractValue,
  ModuleAnalysis,
  PlanContext,
  RecognizerTable,
  SymbolId,
  YukuNode as Node,
} from '@tanstack/router-utils/compiler'

export type CallNode = Extract<Node, { type: 'CallExpression' }>
export type MemberNode = Extract<Node, { type: 'MemberExpression' }>
export type JsxElementNode = Extract<Node, { type: 'JSXElement' }>

export interface ChainLink {
  method: string
  call: CallNode
  member: MemberNode
  /** The receiver's value before this link. */
  receiver: AbstractValue
  /** The value after this link. */
  result: AbstractValue
  /** The first argument (null when absent). */
  arg: Node | null
  argIsSpread: boolean
}

export interface Chain {
  /** The node the segment starts at in this module: a factory call or a reference to a stored value. */
  head: Node
  headIsFactoryCall: boolean
  /** The value of the head (before the first link of this segment). */
  headValue: AbstractValue
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

export interface EnvOnlyCall {
  call: CallNode
  kind: 'server' | 'client'
  arg: Node | null
}

export interface RscCall {
  call: CallNode
  kind: 'rsc:render' | 'rsc:composite' | 'rsc:stream'
}

export interface UnsupportedUse {
  node: Node
  value: AbstractValue
}

export interface StartAnalysis {
  values: ValueAnalysis
  table: RecognizerTable
  chains: Array<Chain>
  envOnlyCalls: Array<EnvOnlyCall>
  clientOnlyElements: Array<JsxElementNode>
  rscCalls: Array<RscCall>
  unsupported: Array<UnsupportedUse>
  /** Bindings (symbols) whose value is a Start value. */
  startBindings: Set<SymbolId>
}

const cache = new WeakMap<ModuleAnalysis, StartAnalysis>()

function isWrapper(n: Node): boolean {
  switch (n.type) {
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'TSInstantiationExpression':
    case 'ChainExpression':
      return true
    default:
      return false
  }
}

export function unwrapNode(n: Node): Node {
  let cur = n
  while (true) {
    switch (cur.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
      case 'ChainExpression':
        cur = cur.expression
        continue
      default:
        return cur
    }
  }
}

function isRscKind(kind: string): kind is RscCall['kind'] {
  return (
    kind === START_KINDS.rscRender ||
    kind === START_KINDS.rscComposite ||
    kind === START_KINDS.rscStream
  )
}

/** Whether an unsupported use of this value may leak code (computed member on a builder/factory). */
function isLeakProne(table: RecognizerTable, v: AbstractValue): boolean {
  switch (v.t) {
    case 'factory':
      return table.builderKinds.has(v.kind) || v.kind in table.envOnlyKinds
    case 'builder':
    case 'isoFn':
    case 'startInstance':
      return true
    default:
      return false
  }
}

/**
 * The Start analysis of a plan: computed once per compile attempt.
 */
export function startAnalysisOf(
  ctx: Pick<PlanContext, 'analysis' | 'symbols' | 'prefetched'>,
  table: RecognizerTable,
  prefetchName = 'start-env',
): StartAnalysis {
  const hit = cache.get(ctx.analysis)
  if (hit) {
    return hit
  }
  const prefetch = ctx.prefetched.get(prefetchName) as StartPrefetch | undefined
  const file = ctx.analysis.file
  const values = new ValueAnalysis(file, {
    table,
    resolveImport: importResolverOf(prefetch),
  })
  const result: StartAnalysis = {
    values,
    table,
    chains: [],
    envOnlyCalls: [],
    clientOnlyElements: [],
    rscCalls: [],
    unsupported: [],
    startBindings: new Set(),
  }
  const parentOf = (n: Node) => file.parentOf(n)
  const seenTerminal = new Set<Node>()
  const seenEnvOnly = new Set<Node>()
  const seenJsx = new Set<Node>()
  const seenRsc = new Set<Node>()
  const seenUnsupported = new Set<Node>()
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

  const jsxCandidate = (opening: Node) => {
    const element = parentOf(opening)
    if (element && element.type === 'JSXElement' && !seenJsx.has(element)) {
      seenJsx.add(element)
      result.clientOnlyElements.push(element)
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
    const headValue = startValue
    let outer: Node = node
    let p: Node | null = null
    for (;;) {
      outer = node
      p = parentOf(outer)
      while (p && isWrapper(p)) {
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
            return
          }
          node = call
          value = v2
          continue
        }
        // calling a server fn, an isomorphic fn or an env-only result: the chain ends here
        break
      }
      if (p.type === 'MemberExpression' && p.object === outer) {
        const member = p
        if (member.computed) {
          if (isLeakProne(table, value)) {
            unsupported = true
            if (!seenUnsupported.has(member)) {
              seenUnsupported.add(member)
              result.unsupported.push({ node: member, value })
            }
          }
          break
        }
        const name = memberName(member)
        if (name === null) {
          return
        }
        let mOuter: Node = member
        let pp = parentOf(member)
        while (pp && isWrapper(pp)) {
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
              result: v2,
              arg: arg && arg.type === 'SpreadElement' ? arg : arg,
              argIsSpread: arg?.type === 'SpreadElement',
            })
            if (v2.t === 'unknown') {
              // an unrecognised method on a builder (`.url()`?): the chain ends here
              links.pop()
              break
            }
            node = call
            value = v2
            continue
          }
          if (value.t === 'namespace' || value.t === 'startInstance') {
            const mv = values.valueOf(member)
            if (isStartValue(table, mv)) {
              node = member
              value = mv
              continue
            }
          }
          return
        }
        // a member read that is not called
        const mv = values.valueOf(member)
        if (isStartValue(table, mv)) {
          node = member
          value = mv
          continue
        }
        break
      }
      if (p.type === 'CallExpression' && p.callee !== outer) {
        // an argument of a user helper returning that parameter (`wrap(x)`): the value flows through
        const idx = (p.arguments as ReadonlyArray<Node>).indexOf(outer)
        if (idx !== -1) {
          const fnValue = values.valueOf(p.callee)
          if (
            fnValue.t === 'function' &&
            fnValue.returns.t === 'param' &&
            fnValue.returns.index === idx
          ) {
            node = p
            continue
          }
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
      break
    }
    // terminal
    if (
      p &&
      p.type === 'VariableDeclarator' &&
      p.init === outer &&
      p.id.type === 'Identifier'
    ) {
      const b = file.bindingOf(p.id)
      if (b && isStartValue(table, value)) {
        result.startBindings.add(b.id as SymbolId)
        enqueueBinding(b.id)
      }
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
      headValue,
      links,
      terminal: node,
      terminalValue: value,
      wrapped: outer,
      parent: p,
      unsupported,
    })
  }

  /** Whether a namespace of a project module has a member with a Start value (phase A). */
  const namespaceHasStartMember = (specifier: string): boolean => {
    if (!prefetch) {
      return false
    }
    const prefix = `${specifier}\u0000`
    for (const [k, v] of prefetch.values) {
      if (k.startsWith(prefix) && isStartValue(table, v)) {
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
    result.startBindings.add(b.id as SymbolId)
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
      if (ref.inTypePosition || ref.isWrite) {
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
  }
  cache.set(ctx.analysis, result)
  return result
}
