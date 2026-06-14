import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'

export type BeforeLoadLevel =
  | 'app'
  | 'org'
  | 'projects'
  | 'project'
  | 'tasks'
  | 'task'

export interface BeforeLoadCounters {
  app: number
  org: number
  projects: number
  project: number
  tasks: number
  task: number
}

export interface RootBenchmarkContext {
  seed: number
  version: number
  authToken: string
  counters: BeforeLoadCounters
}

export interface TenantContext {
  tenantId: string
  tenantChecksum: number
  contextVersion: number
}

export interface OrgContext {
  orgId: string
  orgPermissions: [string, string, string]
  orgChecksum: number
}

export interface ProjectsContext {
  projectIndexSeed: number
  breadcrumb: [string, string, string]
}

export interface ProjectContext {
  projectId: string
  projectChecksum: number
  projectFlags: {
    canEdit: boolean
    canArchive: boolean
  }
}

export interface TaskListContext {
  taskListSeed: number
  taskScope: string
}

export interface TaskContext {
  taskId: string
  taskChecksum: number
  taskMarker: string
}

export interface TaskRouteTarget {
  orgId: string
  projectId: string
  taskId: string
}

export type BeforeLoadContextAction =
  | {
      type: 'navigate'
      target: TaskRouteTarget
    }
  | {
      type: 'invalidate'
      rootSeed: number
    }

const beforeLoadLevels: Array<BeforeLoadLevel> = [
  'app',
  'org',
  'projects',
  'project',
  'tasks',
  'task',
]

const rootSeed = 0x51f15e
const actionSeed = 0xbef05eed

export const initialTaskTarget: TaskRouteTarget = {
  orgId: 'org-initial',
  projectId: 'project-initial',
  taskId: 'task-initial',
}

export function createBeforeLoadCounters(): BeforeLoadCounters {
  return {
    app: 0,
    org: 0,
    projects: 0,
    project: 0,
    tasks: 0,
    task: 0,
  }
}

export function cloneBeforeLoadCounters(counters: BeforeLoadCounters) {
  return {
    app: counters.app,
    org: counters.org,
    projects: counters.projects,
    project: counters.project,
    tasks: counters.tasks,
    task: counters.task,
  } satisfies BeforeLoadCounters
}

export function assertAllBeforeLoadLevels(
  counters: BeforeLoadCounters,
  label: string,
) {
  for (const level of beforeLoadLevels) {
    if (counters[level] <= 0) {
      throw new Error(`${label} skipped beforeLoad level: ${level}`)
    }
  }
}

export function assertBeforeLoadLevelsAdvanced(
  before: BeforeLoadCounters,
  after: BeforeLoadCounters,
  label: string,
) {
  for (const level of beforeLoadLevels) {
    if (after[level] <= before[level]) {
      throw new Error(`${label} did not recompute beforeLoad level: ${level}`)
    }
  }
}

export function createRootBenchmarkContext(): RootBenchmarkContext {
  return {
    seed: rootSeed,
    version: 0,
    authToken: `auth-${rootSeed.toString(36)}`,
    counters: createBeforeLoadCounters(),
  }
}

export function updateRootBenchmarkContext(
  context: RootBenchmarkContext,
  seed: number,
) {
  context.seed = seed
  context.version += 1
  context.authToken = `auth-${seed.toString(36)}-${context.version.toString(36)}`

  return context.version
}

export function buildTaskPath(target: TaskRouteTarget) {
  return `/app/${target.orgId}/projects/${target.projectId}/tasks/${target.taskId}`
}

export function makeTaskChain(target: TaskRouteTarget) {
  return `${target.orgId}/${target.projectId}/${target.taskId}`
}

export function runContextComputation(
  seed: number,
  label: string,
  rounds = 52,
) {
  let value = Math.trunc(seed) >>> 0

  for (let index = 0; index < label.length; index++) {
    value = (value * 33 + label.charCodeAt(index) + index) >>> 0
  }

  for (let index = 0; index < rounds; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
    value ^= value >>> 13
  }

  return value >>> 0
}

export function deriveTenantContext(
  context: RootBenchmarkContext,
): TenantContext {
  context.counters.app += 1

  const tenantChecksum = runContextComputation(
    context.seed + context.version,
    context.authToken,
  )

  return {
    tenantId: `tenant-${tenantChecksum % 997}`,
    tenantChecksum,
    contextVersion: context.version,
  }
}

export function deriveOrgContext(
  context: RootBenchmarkContext & TenantContext,
  orgId: string,
): OrgContext {
  context.counters.org += 1

  const orgChecksum = runContextComputation(
    context.tenantChecksum + orgId.length,
    `${context.tenantId}:${orgId}`,
  )

  return {
    orgId,
    orgPermissions: [
      `read:${orgId}`,
      `write:${orgChecksum % 17}`,
      `tenant:${context.tenantId}`,
    ],
    orgChecksum,
  }
}

export function deriveProjectsContext(
  context: RootBenchmarkContext & TenantContext & OrgContext,
): ProjectsContext {
  context.counters.projects += 1

  const projectIndexSeed = runContextComputation(
    context.orgChecksum + context.orgPermissions.length,
    `${context.orgId}:projects`,
  )

  return {
    projectIndexSeed,
    breadcrumb: [context.tenantId, context.orgId, 'projects'],
  }
}

export function deriveProjectContext(
  context: RootBenchmarkContext & TenantContext & OrgContext & ProjectsContext,
  projectId: string,
): ProjectContext {
  context.counters.project += 1

  const projectChecksum = runContextComputation(
    context.projectIndexSeed + projectId.length,
    `${context.orgId}:${projectId}`,
  )

  return {
    projectId,
    projectChecksum,
    projectFlags: {
      canEdit: projectChecksum % 2 === 0,
      canArchive: projectChecksum % 5 === 0,
    },
  }
}

export function deriveTaskListContext(
  context: RootBenchmarkContext & OrgContext & ProjectContext,
): TaskListContext {
  context.counters.tasks += 1

  const taskListSeed = runContextComputation(
    context.projectChecksum + context.orgChecksum,
    `${context.projectId}:tasks`,
  )

  return {
    taskListSeed,
    taskScope: `${context.orgId}:${context.projectId}`,
  }
}

export function deriveTaskContext(
  context: RootBenchmarkContext &
    TenantContext &
    OrgContext &
    ProjectContext &
    TaskListContext,
  taskId: string,
): TaskContext {
  context.counters.task += 1

  const taskChecksum = runContextComputation(
    context.taskListSeed + taskId.length,
    `${context.taskScope}:${taskId}`,
  )

  return {
    taskId,
    taskChecksum,
    taskMarker: `${context.orgId}/${context.projectId}/${taskId}/${context.contextVersion}/${taskChecksum}`,
  }
}

function createTaskTarget(
  random: () => number,
  cycleIndex: number,
  prefix: string,
  orgId?: string,
  projectId?: string,
): TaskRouteTarget {
  const suffix = cycleIndex.toString(36)

  return {
    orgId: orgId ?? `org-${prefix}-${randomSegment(random)}-${suffix}`,
    projectId:
      projectId ?? `project-${prefix}-${randomSegment(random)}-${suffix}`,
    taskId: `task-${prefix}-${randomSegment(random)}-${suffix}`,
  }
}

function createActionCycle(
  random: () => number,
  cycleIndex: number,
): Array<BeforeLoadContextAction> {
  const first = createTaskTarget(random, cycleIndex, 'a')
  const sameProject = createTaskTarget(
    random,
    cycleIndex,
    'b',
    first.orgId,
    first.projectId,
  )
  const sameOrg = createTaskTarget(random, cycleIndex, 'c', first.orgId)
  const nextOrg = createTaskTarget(random, cycleIndex, 'd')
  const backToFirstOrg = createTaskTarget(random, cycleIndex, 'e', first.orgId)
  const rootSeedForCycle =
    10_000 + Math.floor(random() * 1_000_000) + cycleIndex

  return [
    { type: 'navigate', target: first },
    { type: 'navigate', target: sameProject },
    { type: 'navigate', target: sameOrg },
    { type: 'navigate', target: nextOrg },
    { type: 'invalidate', rootSeed: rootSeedForCycle },
    { type: 'navigate', target: backToFirstOrg },
  ]
}

function createBeforeLoadContextActions() {
  const random = createDeterministicRandom(actionSeed)
  const actions: Array<BeforeLoadContextAction> = []

  for (let cycleIndex = 0; cycleIndex < 3; cycleIndex++) {
    actions.push(...createActionCycle(random, cycleIndex))
  }

  return actions
}

export const beforeLoadContextActions = createBeforeLoadContextActions()
