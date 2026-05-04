/**
 * Module augmentations that teach `@tanstack/router-core` about the
 * Remix-specific component shapes we accept on routes and the router.
 *
 * Importing this module (transitively, via the package entry) is what
 * makes `route.options.component`, `defaultComponent`, etc. typecheck
 * for `remix/ui` factory components.
 */
import type { Handle, RemixNode } from '@remix-run/ui'

/**
 * Render function returned by a `remix/ui` component factory. The type isn't
 * re-exported from the package entry, so we inline the structural shape.
 */
type RenderFn<TProps = Record<string, any>> = (props: TProps) => RemixNode

/**
 * Component shape accepted everywhere a route component is used.
 * `remix/ui` components are factory functions returning a render function.
 */
export type RemixRouteComponent = (handle: Handle<any, any>) => RenderFn<any>

export type RemixErrorRouteComponent = (
  handle: Handle<{ error: unknown; reset?: () => void; info?: unknown }, any>,
) => RenderFn<any>

export type RemixNotFoundRouteComponent = (
  handle: Handle<any, any>,
) => RenderFn<any>

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    /** Default route component used when a matched route has no `component`. */
    defaultComponent?: RemixRouteComponent
    /** Default `errorComponent` used when a matched route throws. */
    defaultErrorComponent?: RemixErrorRouteComponent
    /** Default `pendingComponent` rendered while a loader is in flight. */
    defaultPendingComponent?: RemixRouteComponent
    /** Default `notFoundComponent` for unmatched URLs or `notFound()` throws. */
    defaultNotFoundComponent?: RemixNotFoundRouteComponent
    /**
     * Wrap the entire router tree. Useful for theme providers and similar
     * tree-wide setup. Must not render extra DOM, to avoid hydration drift.
     *
     * Called as a function: `Wrap({ children: <Matches />})`. Returns a
     * `RemixNode`. The function shape (rather than a Remix UI factory)
     * matches the cross-binding contract — the same `Wrap` value works
     * with React/Solid bindings too.
     */
    Wrap?: (props: { children: RemixNode }) => RemixNode
    /**
     * Wrap the match tree (inside the router context, inside the
     * global catch boundary). Use this for providers that need
     * `useRouter` etc. but should NOT wrap the document shell.
     */
    InnerWrap?: (props: { children: RemixNode }) => RemixNode
  }

  export interface UpdatableRouteOptionsExtensions {
    component?: RemixRouteComponent
    errorComponent?: RemixErrorRouteComponent
    pendingComponent?: RemixRouteComponent
    notFoundComponent?: RemixNotFoundRouteComponent
  }

  export interface RootRouteOptionsExtensions {
    shellComponent?: RemixRouteComponent
  }
}
