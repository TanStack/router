import type { HistoryAction } from '@tanstack/history'
import type { ParsedLocation } from './location'

export function getLocationChangeInfo(
  location: ParsedLocation,
  resolvedLocation?: ParsedLocation,
) {
  const fromLocation = resolvedLocation
  const toLocation = location
  const pathChanged = fromLocation?.pathname !== toLocation.pathname
  const hrefChanged = fromLocation?.href !== toLocation.href
  const hashChanged = fromLocation?.hash !== toLocation.hash
  return { fromLocation, toLocation, pathChanged, hrefChanged, hashChanged }
}

export const locationHistoryActions = new WeakMap<
  ParsedLocation,
  HistoryAction
>()
