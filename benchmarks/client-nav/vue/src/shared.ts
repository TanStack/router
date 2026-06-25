export function runPerfSelectorComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 40; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

export function normalizePage(value: unknown) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1
}

export function normalizeFilter(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : 'all'
}

export const noop = () => {}
export const rootSelectors = Array.from({ length: 10 }, (_, index) => index)
export const routeSelectors = Array.from({ length: 6 }, (_, index) => index)
export const linkGroups = Array.from({ length: 4 }, (_, index) => index)
