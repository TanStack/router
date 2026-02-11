import { createStart } from '@tanstack/react-start'

/**
 * Default dehydrate configuration controlled by VITE_DEHYDRATE_DEFAULTS env var.
 *
 * Values:
 * - "" (unset): No defaultDehydrate set — uses builtin defaults
 *   { beforeLoad: true, loader: true, context: false }
 * - "all-true": All methods dehydrate by default
 *   { beforeLoad: true, loader: true, context: true }
 * - "all-false": No methods dehydrate by default
 *   { beforeLoad: false, loader: false, context: false }
 */
function getDefaultDehydrate() {
  const mode = import.meta.env.VITE_DEHYDRATE_DEFAULTS || ''
  switch (mode) {
    case 'all-true':
      return {
        beforeLoad: true as const,
        loader: true as const,
        context: true as const,
      }
    case 'all-false':
      return {
        beforeLoad: false as const,
        loader: false as const,
        context: false as const,
      }
    default:
      return undefined
  }
}

export const startInstance = createStart(() => ({
  defaultDehydrate: getDefaultDehydrate(),
}))
