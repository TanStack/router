/**
 * Start's recorder for the server-code check (R132; the check and how to
 * remove it: `@tanstack/router-utils` `src/compiler/server-code.ts`): the
 * server-only text Start's analysis recognises in a module, read from the
 * analysis alone, with no condition on shape or environment role, so a
 * site the planner skips is still checked. A redundancy net: `start-env`
 * does not read it, and it goes with the check in one deletion (this
 * module and its hook in `startEnvPlanner`).
 */
import { ownEntry } from '@tanstack/router-utils/compiler'
import { startAnalysisOf } from '../compiler/start-analysis'
import type {
  PlanContext,
  RecognizerTable,
  ServerOnlyText,
} from '@tanstack/router-utils/compiler'

/** What each server-only link's argument is, by builder kind and method. */
const SUBJECTS: Readonly<Record<string, string>> = {
  'serverFn.handler': "the server function's handler",
  'serverFn.validator': "the server function's validator",
  'middleware.server': "the middleware's server implementation",
  'middleware.validator': "the middleware's validator",
  'isoFn.server': "the isomorphic function's server implementation",
}

/**
 * Every argument of a builder link the recognizer table keeps on the server
 * (`builderLinks`: a server fn's `.handler()` and `.validator()`, a
 * middleware's `.server()` and `.validator()`, an isomorphic fn's
 * `.server()`), and the argument of every `createServerOnlyFn` call.
 */
export function startServerCode(
  ctx: PlanContext,
  table: RecognizerTable,
): Array<ServerOnlyText> {
  const analysis = startAnalysisOf(ctx, table)
  const texts: Array<ServerOnlyText> = []
  for (const chain of analysis.chains) {
    for (const { receiver, method, arg } of chain.links) {
      const kind = receiver.t === 'builder' ? receiver.kind : receiver.t
      const links = ownEntry(table.builderLinks ?? {}, kind)
      if (arg !== null && links && ownEntry(links, method) === 'server') {
        texts.push({
          range: { start: arg.start, end: arg.end },
          subject:
            ownEntry(SUBJECTS, `${kind}.${method}`) ??
            `the argument of \`.${method}()\``,
        })
      }
    }
  }
  for (const { kind, arg } of analysis.envOnlyCalls) {
    if (kind === 'server' && arg !== null) {
      texts.push({
        range: { start: arg.start, end: arg.end },
        subject: "the server-only function's body",
      })
    }
  }
  return texts
}
