import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'

export const INITIAL_CONTROL_FLOW_PATH = '/flow/start'
export const CONTROL_FLOW_CYCLE_COUNT = 2
export const CONTROL_FLOW_NAVIGATION_COUNT = CONTROL_FLOW_CYCLE_COUNT * 8

export type ControlFlowBranch =
  | 'start'
  | 'target'
  | 'not-found'
  | 'error'
  | 'search-valid'
  | 'search-error'
  | 'unmatched'

export interface ControlFlowMarker {
  branch: ControlFlowBranch
  value: string
}

export interface ControlFlowAction {
  label: string
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  expected: ControlFlowMarker
}

export interface ControlFlowSearch {
  mode: 'valid'
  token: string
  checksum: number
}

const CONTROL_FLOW_SEED = 0xc0ff_ee10
const EMPTY_VALUE = 'empty'

export const START_MARKER = createControlFlowMarker('start', 'start')
export const NOT_FOUND_MARKER = createControlFlowMarker('not-found', 'route')
export const ERROR_MARKER = createControlFlowMarker('error', 'loader')
export const SEARCH_ERROR_MARKER = createControlFlowMarker(
  'search-error',
  'validation',
)
export const UNMATCHED_MARKER = createControlFlowMarker('unmatched', 'root')

export function createControlFlowMarker(
  branch: ControlFlowBranch,
  value: string,
): ControlFlowMarker {
  return { branch, value }
}

export function normalizeFlowId(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || EMPTY_VALUE
}

export function computeControlFlowChecksum(value: string) {
  let checksum = 0

  for (let index = 0; index < value.length; index++) {
    checksum = (checksum * 33 + value.charCodeAt(index) + index) >>> 0
  }

  return checksum
}

export function createShallowControlFlowError(kind: string, id: unknown) {
  const error = new Error(`control-flow-${kind}:${normalizeFlowId(id)}`)
  error.stack = ''
  return error
}

export function validateControlFlowSearch(
  search: Record<string, unknown>,
): ControlFlowSearch {
  const mode = typeof search.mode === 'string' ? search.mode : 'valid'
  const token = normalizeFlowId(search.token)

  if (mode === 'invalid') {
    throw createShallowControlFlowError('search-validation', token)
  }

  return {
    mode: 'valid',
    token,
    checksum: computeControlFlowChecksum(token),
  }
}

function createActionId(
  runIndex: number,
  cycle: number,
  branch: string,
  random: () => number,
) {
  return `${branch}-${runIndex.toString(36)}-${cycle.toString(
    36,
  )}-${randomSegment(random)}`
}

function createTargetAction(label: string, id: string): ControlFlowAction {
  return {
    label,
    to: '/flow/target/$id',
    params: { id },
    expected: createControlFlowMarker('target', normalizeFlowId(id)),
  }
}

function createRedirectAction(
  label: string,
  to: string,
  id: string,
): ControlFlowAction {
  return {
    label,
    to,
    params: { id },
    expected: createControlFlowMarker('target', normalizeFlowId(id)),
  }
}

export function createControlFlowActions(runIndex: number) {
  const random = createDeterministicRandom(CONTROL_FLOW_SEED + runIndex * 101)
  const actions: Array<ControlFlowAction> = []

  for (let cycle = 0; cycle < CONTROL_FLOW_CYCLE_COUNT; cycle++) {
    const targetId = createActionId(runIndex, cycle, 'target', random)
    const beforeLoadId = createActionId(runIndex, cycle, 'before', random)
    const loaderRedirectId = createActionId(runIndex, cycle, 'loader', random)
    const notFoundId = createActionId(runIndex, cycle, 'missing', random)
    const errorId = createActionId(runIndex, cycle, 'error', random)
    const validToken = createActionId(runIndex, cycle, 'valid-search', random)
    const invalidToken = createActionId(
      runIndex,
      cycle,
      'invalid-search',
      random,
    )
    const unmatchedId = createActionId(runIndex, cycle, 'unmatched', random)

    actions.push(
      createTargetAction('normal target', targetId),
      createRedirectAction(
        'beforeLoad redirect',
        '/flow/redirect-before-load/$id',
        beforeLoadId,
      ),
      createRedirectAction(
        'loader redirect',
        '/flow/redirect-loader/$id',
        loaderRedirectId,
      ),
      {
        label: 'not found',
        to: '/flow/not-found/$id',
        params: { id: notFoundId },
        expected: NOT_FOUND_MARKER,
      },
      {
        label: 'loader error',
        to: '/flow/error/$id',
        params: { id: errorId },
        expected: ERROR_MARKER,
      },
      {
        label: 'valid search',
        to: '/flow/search',
        search: { mode: 'valid', token: validToken, junk: `strip-${cycle}` },
        expected: createControlFlowMarker(
          'search-valid',
          normalizeFlowId(validToken),
        ),
      },
      {
        label: 'invalid search',
        to: '/flow/search',
        search: { mode: 'invalid', token: invalidToken },
        expected: SEARCH_ERROR_MARKER,
      },
      {
        label: 'unmatched',
        to: `/flow/unmatched/${unmatchedId}`,
        expected: UNMATCHED_MARKER,
      },
    )
  }

  return actions
}
