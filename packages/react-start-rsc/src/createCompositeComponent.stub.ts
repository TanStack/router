import type {
  CompositeComponentResult,
  ValidateCompositeComponent,
} from './ServerComponentTypes'

/**
 * Client stub for createCompositeComponent.
 *
 * This function should never be called at runtime on the client.
 * It exists only to satisfy bundler imports in client bundles.
 * The real implementation only runs inside server functions.
 */
export function createCompositeComponent<TComp>(
  _component: ValidateCompositeComponent<TComp>,
): Promise<CompositeComponentResult<TComp>> {
  throw new Error(
    process.env.NODE_ENV !== 'production'
      ? "createCompositeComponent cannot be called on the client. Call it inside a server function's `.handler()`, and call that server function where you need the result (e.g. in the route's loader)."
      : 'createCompositeComponent cannot be called on the client',
  )
}
