/**
 * Start's recorder for the server-code check (R132; the check and how to
 * remove it: `@tanstack/router-utils` `src/compiler/server-code.ts`): the
 * server-only text Start's analysis recognises in a module, read from the
 * analysis alone (`serverCodeArgs`, compiled or not), with no condition on
 * shape or environment role, so a site the planner skips is still checked.
 * A redundancy net: `start-env` does not read it, and it goes with the
 * check in one deletion (this module and its hook in `startEnvPlanner`).
 */
import { ownEntry } from '@tanstack/router-utils/compiler'
import { serverCodeArgs, startAnalysisOf } from '../compiler/start-analysis'
import type {
  PlanContext,
  RecognizerTable,
  ServerOnlyText,
} from '@tanstack/router-utils/compiler'

/** What each server-only argument is, by position (`ServerCodeArg.position`). */
const SUBJECTS: Readonly<Record<string, string>> = {
  'serverFn.handler': "the server function's handler",
  'serverFn.validator': "the server function's validator",
  'middleware.server': "the middleware's server implementation",
  'middleware.validator': "the middleware's validator",
  'isoFn.server': "the isomorphic function's server implementation",
  serverOnly: "the server-only function's body",
}

/**
 * Every server-only argument the analysis recognises (`serverCodeArgs`),
 * compiled or not.
 */
export function startServerCode(
  ctx: PlanContext,
  table: RecognizerTable,
): Array<ServerOnlyText> {
  return serverCodeArgs(startAnalysisOf(ctx, table), table).map(
    ({ arg, position, api }) => ({
      range: { start: arg.start, end: arg.end },
      subject: ownEntry(SUBJECTS, position) ?? `the argument of \`${api}()\``,
    }),
  )
}
