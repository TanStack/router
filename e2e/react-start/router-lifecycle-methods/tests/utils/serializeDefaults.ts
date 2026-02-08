/**
 * The SERIALIZE_DEFAULTS env var controls what defaultSerialize config
 * is passed to createStart(). Tests read this to know what the effective
 * defaults are and compute expected values accordingly.
 *
 * Values:
 * - "" (unset): builtin defaults { beforeLoad: true, loader: true, context: false }
 * - "all-true": { beforeLoad: true, loader: true, context: true }
 * - "all-false": { beforeLoad: false, loader: false, context: false }
 */
export const serializeDefaultsMode: string =
  process.env.SERIALIZE_DEFAULTS || ''

export interface MethodDefaults {
  context: boolean
  beforeLoad: boolean
  loader: boolean
}

/**
 * Returns the effective default serialize flag for each lifecycle method,
 * considering the SERIALIZE_DEFAULTS env var (router-level defaultSerialize)
 * and the builtin defaults.
 */
export function getEffectiveDefaults(): MethodDefaults {
  switch (serializeDefaultsMode) {
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
