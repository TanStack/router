/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Frame } from '@remix-run/ui'
import { useRouter } from './useRouter'
import { getMatchId } from './MatchContext'
import { subscribeStore } from './subscribe'
import type { Handle, RemixNode, Renderable } from '@remix-run/ui'

export interface FrameOutletProps {
  /** Optional name so descendants can target this outlet via `frames.get(name)`. */
  name?: string
  /** Fallback content while the frame loads. */
  fallback?: Renderable
}

/**
 * Alternate `<Outlet>` that delegates child rendering to a `remix/ui`
 * `<Frame src={…}>`. The frame's `src` tracks the current pathname; on
 * navigation, the frame fetches the new HTML chunk from the server
 * instead of recursively re-rendering the match tree client-side.
 *
 * **Trade-offs vs. {@link Outlet}:**
 *
 * - **Smaller client bundle** — child route components don't need to ship
 *   to the browser at all. The server renders each pathname; the frame
 *   replaces its content on navigation.
 * - **Server roundtrip on every navigation** — what `<Outlet>` does
 *   in-browser via the match store, `<FrameOutlet>` does over the wire.
 *   Suitable for content-heavy / mostly-static routes; less suitable for
 *   highly-interactive nested UIs that would re-fetch the same data.
 * - **The server must be able to render the route's URL on its own** —
 *   the frame does a `GET pathname` and replaces its content with the
 *   `<body>` of that response. Your `createRouterHandler` already does
 *   this; this component just opts that pathname into Frame mode.
 *
 * Use sparingly. The default `<Outlet>` is the right choice for most
 * apps. `<FrameOutlet>` shines when:
 * - A route renders mostly static content (docs, marketing) that doesn't
 *   benefit from client-side reactivity.
 * - You want to ship as little JS as possible per page.
 *
 * Setup-time only: each `<FrameOutlet>` subscribes to the location store
 * and re-renders the frame's `src` on navigation.
 */
export function FrameOutlet(handle: Handle<FrameOutletProps>) {
  const router = useRouter(handle)
  const parentMatchId = getMatchId(handle)
  const readLocation = subscribeStore(handle, router.stores.location)

  return ({ name, fallback }: FrameOutletProps): RemixNode => {
    void parentMatchId
    const src = readLocation().href || '/'
    return <Frame name={name} src={src} fallback={fallback} />
  }
}
