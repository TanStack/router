import { createStart } from '@tanstack/react-start'

/**
 * Default serialize configuration controlled by VITE_SERIALIZE_DEFAULTS env var.
 *
 * Values:
 * - "" (unset): No defaultSerialize set — uses builtin defaults
 *   { beforeLoad: true, loader: true, context: false }
 * - "all-true": All methods serialize by default
 *   { beforeLoad: true, loader: true, context: true }
 * - "all-false": No methods serialize by default
 *   { beforeLoad: false, loader: false, context: false }
 */
function getDefaultSerialize() {
  const mode = import.meta.env.VITE_SERIALIZE_DEFAULTS || ''
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
  defaultSerialize: getDefaultSerialize(),
}))
