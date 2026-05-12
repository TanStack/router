/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import type { Handle, RemixNode } from '@remix-run/ui'

/**
 * Provides the current match id to descendant components.
 *
 * `remix/ui` keys context by component identity, so this component is the
 * lookup key — descendants call `handle.context.get(MatchContext)` to read
 * the matchId of their nearest enclosing `<Match>`.
 *
 * The context value is set inside the render function (not setup) so it
 * tracks `props.matchId` reactively. The setup phase runs once per
 * component instance, but Remix UI's diff reuses `<MatchContext>`
 * instances across navigations — descendants like `<Outlet>` read the
 * value via `getContext` on their own setup *and* on each render of an
 * ancestor that propagates updates downward, so the latest value wins.
 */
export function MatchContext(
  handle: Handle<{ matchId: string; children?: RemixNode }, string>,
) {
  return ({
    matchId,
    children,
  }: {
    matchId: string
    children?: RemixNode
  }): RemixNode => {
    handle.context.set(matchId)
    return <>{children}</>
  }
}

/**
 * The current match id from the nearest enclosing `<Match>`. Returns
 * `undefined` when called outside a `<Match>` (i.e. directly under the
 * root before the first match).
 */
export function getMatchId(handle: Handle<any, any>): string | undefined {
  return handle.context.get(MatchContext) as string | undefined
}
