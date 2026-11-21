import type {
  RenderableServerComponentBuilder,
  ValidateRenderableServerComponent,
} from './ServerComponentTypes'

/**
 * Client stub for renderServerComponent.
 *
 * This function should never be called at runtime on the client.
 * It exists only to satisfy bundler imports in client bundles.
 * The real implementation only runs inside server functions.
 */
export function renderServerComponent<TNode>(
  _node: ValidateRenderableServerComponent<TNode>,
): Promise<RenderableServerComponentBuilder<TNode>> {
  // Unit/type tests import this stub directly and call it.
  // Avoid throwing in that environment while keeping a hard runtime guard elsewhere.
  if (process.env.NODE_ENV === 'test') {
    return Promise.resolve(null as any)
  }

  throw new Error(
    process.env.NODE_ENV !== 'production'
      ? "renderServerComponent cannot be called on the client. Call it inside a server function's `.handler()`, and call that server function where you need the result (e.g. in the route's loader)."
      : 'renderServerComponent cannot be called on the client',
  )
}
