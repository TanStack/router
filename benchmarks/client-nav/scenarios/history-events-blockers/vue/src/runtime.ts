import {
  createHistoryEventsBlockersRuntime,
  historyEventsBlockersRouteSeed,
  type HistoryBlockerArgs,
} from '../../shared.ts'

export const historyEventsBlockersRuntime = createHistoryEventsBlockersRuntime()

export function shouldBlockHistoryNavigation(args: HistoryBlockerArgs) {
  return historyEventsBlockersRuntime.shouldBlock(args)
}

export const pathSeed = historyEventsBlockersRouteSeed
