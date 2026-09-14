/**
 * Current async post-processing context for deserialization.
 *
 * Some deserializers need to perform async work after synchronous deserialization
 * (e.g., decoding RSC payloads, fetching remote data). This context allows them
 * to register promises that must complete before the deserialized value is used.
 *
 * This uses a synchronous execution context pattern:
 * - Each call to `fromCrossJSON` is synchronous
 * - Within that synchronous execution, all `fromSerializable` calls happen
 * - We set the context before `fromCrossJSON`, clear it after
 * - For streaming chunks, we set/clear context around each `onMessage` call
 *
 * Even with concurrent server function calls, each individual deserialization
 * is atomic (synchronous), so promises are correctly scoped to their call.
 */
let currentPostProcessContext: Array<Promise<unknown>> | null = null

/**
 * Set the current post-processing context for async deserialization work.
 * Called before deserialization starts.
 *
 * @param ctx - Array to collect async work promises, or null to clear
 */
export function setPostProcessContext(
  ctx: Array<Promise<unknown>> | null,
): void {
  currentPostProcessContext = ctx
}

/**
 * Get the current post-processing context.
 * Returns null if no deserialization is in progress.
 */
export function getPostProcessContext(): Array<Promise<unknown>> | null {
  return currentPostProcessContext
}

/**
 * Track an async post-processing promise in the current deserialization context.
 * Called by deserializers that need to perform async work after sync deserialization.
 *
 * If no context is active (e.g., on server), this is a no-op.
 *
 * @param promise - The async work promise to track
 */
export function trackPostProcessPromise(promise: Promise<unknown>): void {
  if (currentPostProcessContext) {
    currentPostProcessContext.push(promise)
  }
}
