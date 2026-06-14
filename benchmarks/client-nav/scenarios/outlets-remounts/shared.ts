import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'

export const outletsRemountsScenarioSlug = 'outlets-remounts'
export const outletsRemountsCycleCount = 3
export const outletsRemountsActionsPerCycle = 6
export const outletsRemountsActionCount =
  outletsRemountsCycleCount * outletsRemountsActionsPerCycle

export type OutletsRemountsRouteId =
  | 'workspace'
  | 'org'
  | 'projects'
  | 'project'
  | 'board'
  | 'card'

export type OutletsRemountsComponentId = OutletsRemountsRouteId

export type OutletsRemountsLifecycleHook = 'enter' | 'stay' | 'leave'

export interface OutletsRemountsLifecycleCounter {
  enter: number
  stay: number
  leave: number
}

export type OutletsRemountsLifecycleCounters = Record<
  OutletsRemountsRouteId,
  OutletsRemountsLifecycleCounter
>

export interface OutletsRemountsComponentCounter {
  mounts: number
  renders: number
}

export type OutletsRemountsComponentCounters = Record<
  OutletsRemountsComponentId,
  OutletsRemountsComponentCounter
>

export interface OutletsRemountsCardTarget {
  kind: 'card'
  orgId: string
  projectId: string
  boardId: string
  cardId: string
}

export interface OutletsRemountsOrgTarget {
  kind: 'org'
  orgId: string
}

export type OutletsRemountsTarget =
  | OutletsRemountsCardTarget
  | OutletsRemountsOrgTarget

export interface OutletsRemountsLocation {
  target: OutletsRemountsTarget
  to:
    | '/workspace/$orgId'
    | '/workspace/$orgId/projects/$projectId/boards/$boardId/cards/$cardId'
  params: Record<string, string>
  marker: string
}

export const outletsRemountsRouteIds = [
  'workspace',
  'org',
  'projects',
  'project',
  'board',
  'card',
] as const satisfies Array<OutletsRemountsRouteId>

export const outletsRemountsInitialTarget: OutletsRemountsCardTarget = {
  kind: 'card',
  orgId: 'org-initial',
  projectId: 'project-initial',
  boardId: 'board-initial',
  cardId: 'card-initial',
}

export const outletsRemountsInitialLocation = createOutletsRemountsLocation(
  outletsRemountsInitialTarget,
)
export const outletsRemountsInitialPath = buildOutletsRemountsPath(
  outletsRemountsInitialTarget,
)

export function createEmptyOutletsRemountsLifecycleCounters(): OutletsRemountsLifecycleCounters {
  return Object.fromEntries(
    outletsRemountsRouteIds.map((routeId) => [
      routeId,
      {
        enter: 0,
        stay: 0,
        leave: 0,
      },
    ]),
  ) as OutletsRemountsLifecycleCounters
}

export function createEmptyOutletsRemountsComponentCounters(): OutletsRemountsComponentCounters {
  return Object.fromEntries(
    outletsRemountsRouteIds.map((routeId) => [
      routeId,
      {
        mounts: 0,
        renders: 0,
      },
    ]),
  ) as OutletsRemountsComponentCounters
}

export function cloneOutletsRemountsLifecycleCounters(
  counters: OutletsRemountsLifecycleCounters,
): OutletsRemountsLifecycleCounters {
  return Object.fromEntries(
    outletsRemountsRouteIds.map((routeId) => [
      routeId,
      { ...counters[routeId] },
    ]),
  ) as OutletsRemountsLifecycleCounters
}

export function cloneOutletsRemountsComponentCounters(
  counters: OutletsRemountsComponentCounters,
): OutletsRemountsComponentCounters {
  return Object.fromEntries(
    outletsRemountsRouteIds.map((routeId) => [
      routeId,
      { ...counters[routeId] },
    ]),
  ) as OutletsRemountsComponentCounters
}

export function buildOutletsRemountsPath(target: OutletsRemountsTarget) {
  if (target.kind === 'org') {
    return `/workspace/${target.orgId}`
  }

  return `/workspace/${target.orgId}/projects/${target.projectId}/boards/${target.boardId}/cards/${target.cardId}`
}

export function createOutletsRemountsMarker(target: OutletsRemountsTarget) {
  if (target.kind === 'org') {
    return `org:${target.orgId}`
  }

  return [
    'card',
    target.orgId,
    target.projectId,
    target.boardId,
    target.cardId,
  ].join(':')
}

export function createOutletsRemountsLocation(
  target: OutletsRemountsTarget,
): OutletsRemountsLocation {
  if (target.kind === 'org') {
    return {
      target,
      to: '/workspace/$orgId',
      params: {
        orgId: target.orgId,
      },
      marker: createOutletsRemountsMarker(target),
    }
  }

  return {
    target,
    to: '/workspace/$orgId/projects/$projectId/boards/$boardId/cards/$cardId',
    params: {
      orgId: target.orgId,
      projectId: target.projectId,
      boardId: target.boardId,
      cardId: target.cardId,
    },
    marker: createOutletsRemountsMarker(target),
  }
}

export function createOutletsRemountsLocations() {
  const random = createDeterministicRandom(0x5eed_0909)
  const locations: Array<OutletsRemountsLocation> = []

  for (let cycle = 0; cycle < outletsRemountsCycleCount; cycle++) {
    const orgA = `org-${cycle}-${randomSegment(random)}`
    const orgB = `org-${cycle}-${randomSegment(random)}`
    const projectA = `project-${cycle}-${randomSegment(random)}`
    const projectB = `project-${cycle}-${randomSegment(random)}`
    const boardA = `board-${cycle}-${randomSegment(random)}`
    const boardB = `board-${cycle}-${randomSegment(random)}`
    const cardA = `card-${cycle}-${randomSegment(random)}`
    const cardB = `card-${cycle}-${randomSegment(random)}`
    const cardC = `card-${cycle}-${randomSegment(random)}`
    const cardD = `card-${cycle}-${randomSegment(random)}`

    locations.push(
      createOutletsRemountsLocation({
        kind: 'card',
        orgId: orgA,
        projectId: projectA,
        boardId: boardA,
        cardId: cardA,
      }),
      createOutletsRemountsLocation({
        kind: 'card',
        orgId: orgA,
        projectId: projectA,
        boardId: boardA,
        cardId: cardB,
      }),
      createOutletsRemountsLocation({
        kind: 'card',
        orgId: orgA,
        projectId: projectA,
        boardId: boardB,
        cardId: cardC,
      }),
      createOutletsRemountsLocation({
        kind: 'card',
        orgId: orgA,
        projectId: projectB,
        boardId: boardA,
        cardId: cardD,
      }),
      createOutletsRemountsLocation({
        kind: 'org',
        orgId: orgB,
      }),
      createOutletsRemountsLocation({
        kind: 'card',
        orgId: orgA,
        projectId: projectA,
        boardId: boardA,
        cardId: cardA,
      }),
    )
  }

  return locations
}

export function runOutletsRemountsComputation(seed: string, rounds = 18) {
  let value = seed.length * 17

  for (let index = 0; index < seed.length; index++) {
    value = (value * 33 + seed.charCodeAt(index)) >>> 0
  }

  for (let index = 0; index < rounds; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}
