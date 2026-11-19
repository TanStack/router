import type { AnyRoute, AnyRouteMatch } from '@tanstack/router-core'

export function getStatusColor(match: AnyRouteMatch) {
  const colorMap = {
    pending: 'yellow',
    success: 'green',
    error: 'red',
    notFound: 'purple',
  } as const

  return match.isFetching && match.status === 'success'
    ? match.isFetching === 'beforeLoad'
      ? 'purple'
      : 'blue'
    : colorMap[match.status]
}
export function getRouteStatusColor(
  matches: Array<AnyRouteMatch>,
  route: AnyRoute,
) {
  const found = matches.find((d) => d.routeId === route.id)
  if (!found) return 'gray'
  return getStatusColor(found)
}

// Symbols for RSC detection
const SERVER_COMPONENT_STREAM = Symbol.for('tanstack.rsc.stream')
const RENDERABLE_RSC = Symbol.for('tanstack.rsc.renderable')
const RSC_SLOT_USAGES = Symbol.for('tanstack.rsc.slotUsages')

export type RscSlotUsageEvent = {
  slot: string
  args?: Array<any>
}

function trimTrailingUndefined<T>(arr: Array<T>): Array<T> {
  let end = arr.length
  while (end > 0 && arr[end - 1] === undefined) end--
  if (end === 0) return arr
  return end === arr.length ? arr : arr.slice(0, end)
}

export type ServerComponentType =
  | 'compositeSource' // createCompositeComponent result (render via <CompositeComponent src={...} />)
  | 'renderableValue' // renderServerComponent result (inline renderable value)
  | null // not a server component

/**
 * Checks if a value is any kind of server component
 */
export const isServerComponent = (value: unknown): boolean => {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    SERVER_COMPONENT_STREAM in value
  )
}

/**
 * Gets the type of server component.
 * - RENDERABLE_RSC === true → renderable (from renderServerComponent)
 * - RENDERABLE_RSC === false or not present → composite (from createCompositeComponent)
 */
export const getServerComponentType = (value: unknown): ServerComponentType => {
  if (!isServerComponent(value)) {
    return null
  }
  const v = value as Record<symbol, unknown>
  if (RENDERABLE_RSC in v && v[RENDERABLE_RSC] === true) {
    return 'renderableValue'
  }
  // RENDERABLE_RSC is false or not present → composite
  return 'compositeSource'
}

/**
 * Gets the slot names from a composite server component (dev only)
 */
export const getServerComponentSlots = (value: unknown): Array<string> => {
  if (!isServerComponent(value)) {
    return []
  }

  const v = value as Record<symbol, unknown>
  const out: Array<string> = []
  // Include any slot names observed via dev-only slot usage events
  if (RSC_SLOT_USAGES in v) {
    const usages = v[RSC_SLOT_USAGES]
    if (Array.isArray(usages)) {
      for (const evt of usages) {
        const name = evt?.slot
        if (typeof name === 'string' && !out.includes(name)) {
          out.push(name)
        }
      }
    }
  }

  return out
}

export const getServerComponentSlotUsages = (
  value: unknown,
): Array<RscSlotUsageEvent> => {
  if (!isServerComponent(value)) {
    return []
  }

  const v = value as Record<symbol, unknown>
  if (!(RSC_SLOT_USAGES in v)) return []
  const usages = v[RSC_SLOT_USAGES]
  if (!Array.isArray(usages)) return []

  return usages.filter((d): d is RscSlotUsageEvent => {
    return (
      d &&
      typeof d === 'object' &&
      typeof d.slot === 'string' &&
      (d.args === undefined || Array.isArray(d.args))
    )
  })
}

export const getServerComponentSlotUsageSummary = (
  value: unknown,
): Record<string, { count: number; invocations: Array<Array<any>> }> => {
  const usages = getServerComponentSlotUsages(value)
  const out: Record<string, { count: number; invocations: Array<Array<any>> }> =
    {}
  for (const evt of usages) {
    const args = trimTrailingUndefined(evt.args ?? [])
    const prev =
      out[evt.slot] ?? (out[evt.slot] = { count: 0, invocations: [] })
    prev.count++
    prev.invocations.push(args)
  }
  return out
}

/**
 * Displays a string regardless the type of the data
 * @param {unknown} value Value to be stringified
 */
export const displayValue = (value: unknown) => {
  if (value === 'React element') return 'React element'
  const componentType = getServerComponentType(value)
  if (componentType === 'compositeSource') {
    const slots = getServerComponentSlots(value)
    if (slots.length > 0) {
      return `RSC composite source (${slots.length} ${
        slots.length === 1 ? 'slot' : 'slots'
      })`
    }
    return 'RSC composite source'
  }
  if (componentType === 'renderableValue') {
    return 'RSC renderable value'
  }
  const name = Object.getOwnPropertyNames(Object(value))
  const newValue = typeof value === 'bigint' ? `${value.toString()}n` : value
  try {
    return JSON.stringify(newValue, name)
  } catch {
    return `unable to stringify`
  }
}

export function multiSortBy<T>(
  arr: Array<T>,
  accessors: Array<(item: T) => any> = [(d) => d],
): Array<T> {
  return arr
    .map((d, i) => [d, i] as const)
    .sort(([a, ai], [b, bi]) => {
      for (const accessor of accessors) {
        const ao = accessor(a)
        const bo = accessor(b)

        if (typeof ao === 'undefined') {
          if (typeof bo === 'undefined') {
            continue
          }
          return 1
        }

        if (ao === bo) {
          continue
        }

        return ao > bo ? 1 : -1
      }

      return ai - bi
    })
    .map(([d]) => d)
}
