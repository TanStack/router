import type {
  NativeOptionsContext,
  NativeRouteOptions,
  NativeRouteOptionsInput,
} from './route'

export function resolveNativeRouteOptions(
  native: NativeRouteOptionsInput | undefined,
  ctx: NativeOptionsContext,
): NativeRouteOptions | undefined {
  if (!native) {
    return undefined
  }

  if (typeof native === 'function') {
    return native(ctx)
  }

  return native
}
