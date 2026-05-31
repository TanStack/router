/**
 * The DEHYDRATE_DEFAULTS env var controls what defaultDehydrate config
 * is passed to createStart(). Tests read this to know what the effective
 * defaults are and compute expected values accordingly.
 *
 * Values:
 * - "" (unset): builtin defaults { beforeLoad: true, loader: true, context: false }
 * - "all-true": { beforeLoad: true, loader: true, context: true }
 * - "all-false": { beforeLoad: false, loader: false, context: false }
 */
export const dehydrateDefaultsMode: string =
  process.env.DEHYDRATE_DEFAULTS || ''

export interface MethodDefaults {
  context: boolean
  beforeLoad: boolean
  loader: boolean
}

/**
 * Returns the effective default dehydrate flag for each lifecycle method,
 * considering the DEHYDRATE_DEFAULTS env var (router-level defaultDehydrate)
 * and the builtin defaults.
 */
export function getEffectiveDefaults(): MethodDefaults {
  switch (dehydrateDefaultsMode) {
    case 'all-true':
      return {
        context: true,
        beforeLoad: true,
        loader: true,
      }
    case 'all-false':
      return {
        context: false,
        beforeLoad: false,
        loader: false,
      }
    default:
      // Builtin defaults
      return {
        context: false,
        beforeLoad: true,
        loader: true,
      }
  }
}
