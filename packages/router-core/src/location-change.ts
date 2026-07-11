import type { HistoryAction } from '@tanstack/history'
import type { ParsedLocation } from './location'

export function getLocationChangeInfo(
  location: ParsedLocation,
  resolvedLocation?: ParsedLocation,
) {
  // built directly from the parameters: local aliases survive minification
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
}

export const locationHistoryActions = new WeakMap<
  ParsedLocation,
  HistoryAction
>()
