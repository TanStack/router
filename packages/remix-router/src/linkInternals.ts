/**
 * Shared constants and helpers used by both `Link` and `useLinkProps`.
 *
 * Both call sites compute the same set of "active link" attributes and
 * use the same hover-preload bookkeeping. Keeping the constants in
 * sync by hand was already a footgun (the strings appear in tests
 * verifying SSR markup, so a typo wouldn't surface until rendering).
 * Centralising them here gives one source of truth.
 */

/**
 * Default active-link attributes when the consumer doesn't pass
 * `activeProps`. These are merged into the rendered anchor when the
 * link's `to` matches the active route.
 */
export const STATIC_DEFAULT_ACTIVE_ATTRIBUTES: Record<string, unknown> = {
  class: 'active',
  'data-status': 'active',
  'aria-current': 'page',
}

/**
 * Attributes applied when the link is `disabled`. Renders an `<a>`
 * shape with the right ARIA so assistive tech announces the disabled
 * state, while the click handler short-circuits navigation.
 */
export const STATIC_DISABLED_PROPS = {
  role: 'link',
  'aria-disabled': true,
} as const

/**
 * Active-state markers added when the link's `to` matches the active
 * route. Excludes `class` because the consumer's `activeProps` (or
 * the default) controls the class — this is just the data/aria pair.
 */
export const STATIC_ACTIVE_ATTRIBUTES = {
  'data-status': 'active',
  'aria-current': 'page',
} as const

/**
 * Markers added while a transition to the link's destination is in
 * flight (loaders running, route mounting, etc.).
 */
export const STATIC_TRANSITIONING_ATTRIBUTES = {
  'data-transitioning': 'transitioning',
} as const

/**
 * Frozen empty object used as a stable identity for falsy
 * spread-targets, so consumers don't allocate new `{}` on every
 * render.
 */
export const EMPTY_OBJECT: Readonly<Record<string, never>> =
  Object.freeze({})

/**
 * Process-global hover-preload timer registry keyed by the link
 * element. WeakMap so detached elements get garbage-collected without
 * us having to teardown the timer manually.
 */
export const timeoutMap = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>()

/**
 * Browser-style "modifier key pressed" check — the link should not
 * intercept the click if the user is opening in a new tab/window or
 * triggering OS shortcuts.
 */
export function isCtrlEvent(e: MouseEvent): boolean {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

/**
 * Returns true if `to` is a string href that's clearly a same-origin
 * relative or root-relative path (`/`, `./`, `../`). Used to skip the
 * router for trivial cases. The character-code checks avoid creating
 * substrings — this gets called on every Link render.
 *
 * - `47` is `/` — root-relative, but only if NOT followed by another
 *   `/` (which would make it a protocol-relative URL like `//cdn.…`).
 * - `46` is `.` — covers `./foo` and `../foo`.
 */
export function isSafeInternal(to: unknown): boolean {
  if (typeof to !== 'string') return false
  const zero = to.charCodeAt(0)
  if (zero === 47) return to.charCodeAt(1) !== 47
  return zero === 46
}
