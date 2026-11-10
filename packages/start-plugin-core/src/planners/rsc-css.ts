/**
 * The `rsc-css` planner (J7): in the env that runs the RSC
 * render, `renderServerComponent(x)` / `createCompositeComponent(fn)` with
 * one argument get the CSS loader as a second argument; a
 * `renderToReadableStream(e)` whose argument is JSX (through parens and
 * assertions, each JSX leaf of a conditional or logical) renders the loader
 * in a fragment around it; an argument the planner cannot see the JSX of
 * gets one development warning per file. The loader expression is the RSC
 * host's (`import.meta.viteRsc.loadCss()`, `import.meta.rspackRsc.loadCss()`),
 * emitted as plain source text in the module that imports the CSS.
 */
import { unwrapExpression } from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../compiler/recognizer'
import { startAnalysisOf } from '../compiler/start-analysis'
import type {
  Frag,
  YukuNode as Node,
  PlanContext,
  Planner,
  Range,
} from '@tanstack/router-utils/compiler'

export const RSC_CSS = 'rsc-css'

export interface RscCssConfig {
  /** The host's CSS loader expression, emitted as source text. */
  loadCssExpression: string
}

const RSC_CSS_OPTIONS_KEY = '__tanstackStartRscCss'

const text = (t: string): Frag => ({ k: 'text', parts: [t] })
const rangeOf = (n: Node): Range => ({ start: n.start, end: n.end })

declare module '@tanstack/router-utils/compiler' {
  interface PlannerData {
    /** The rsc-css planner's `PlannerData` (`RSC_CSS`). */
    'rsc-css': { config: RscCssConfig }
  }
}

export function rscCssPlanner(): Planner<typeof RSC_CSS> {
  const table = startRecognizer()
  return {
    name: RSC_CSS,
    tier: 1,
    gate: (t0) =>
      t0.imports.some(
        (i) =>
          i.specifier === '@tanstack/react-start/rsc' ||
          i.specifier === '@tanstack/react-start-rsc',
      ) ||
      /\b(renderServerComponent|createCompositeComponent|renderToReadableStream)\b/.test(
        t0.source.code,
      ),
    // (registered with its config: the hosts' `rsc` option)
    plan: (ctx) => planRscCss(ctx, ctx.config, table),
  }
}

function planRscCss(
  ctx: PlanContext,
  config: RscCssConfig,
  table: ReturnType<typeof startRecognizer>,
): void {
  const analysis = startAnalysisOf(ctx, table)
  const by = RSC_CSS
  const loadCss = config.loadCssExpression
  let warned = false
  for (const c of analysis.rscCalls) {
    const args = c.call.arguments
    if (args.length !== 1) {
      continue
    }
    const arg = args[0]!
    if (c.kind !== 'rsc:stream') {
      if (arg.type === 'SpreadElement') {
        continue
      }
      ctx.rewrites.edit({
        range: { start: arg.end, end: arg.end },
        body: [text(`, { ${RSC_CSS_OPTIONS_KEY}: ${loadCss} }`)],
        by,
      })
      continue
    }
    const wrapped = wrapJsxLeaves(ctx, arg, loadCss, by)
    if (!wrapped && !warned && ctx.env.mode === 'dev') {
      warned = true
      ctx.diagnostic({
        severity: 'warning',
        message:
          '`renderToReadableStream(…)`: the compiler cannot see the JSX of this argument (a variable or a spread), so the CSS its server components import is not delivered. Pass the JSX element directly: `renderToReadableStream(<Part />)`.',
        range: rangeOf(arg),
        by,
        code: 'rsc-css-opaque-argument',
      })
    }
  }
}

/** Wraps each JSX leaf of `expr` in `<>{loadCss}…</>`; false when no leaf is JSX. */
function wrapJsxLeaves(
  ctx: PlanContext,
  expr: Node,
  loadCss: string,
  by: string,
): boolean {
  if (expr.type === 'SpreadElement') {
    return false
  }
  const inner = unwrapExpression(expr)
  switch (inner.type) {
    case 'JSXElement':
    case 'JSXFragment': {
      const bare = inner === expr
      ctx.rewrites.edit({
        range: { start: expr.start, end: expr.start },
        body: [text(bare ? `<>{${loadCss}}` : `<>{${loadCss}}{`)],
        by,
      })
      ctx.rewrites.edit({
        range: { start: expr.end, end: expr.end },
        body: [text(bare ? '</>' : '}</>')],
        by,
      })
      return true
    }
    case 'ConditionalExpression': {
      const a = wrapJsxLeaves(ctx, inner.consequent, loadCss, by)
      const b = wrapJsxLeaves(ctx, inner.alternate, loadCss, by)
      return a || b
    }
    case 'LogicalExpression':
      return wrapJsxLeaves(ctx, inner.right, loadCss, by)
    default:
      return false
  }
}
