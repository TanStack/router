import {
  createHistoryEventsBlockersRuntime,
  type HistoryBlockerArgs,
} from '../../shared.ts'

export const historyEventsBlockersRuntime = createHistoryEventsBlockersRuntime()

export function shouldBlockHistoryNavigation(args: HistoryBlockerArgs) {
  return historyEventsBlockersRuntime.shouldBlock(args)
}

export function pathSeed(value: string) {
  let seed = 0

  for (let index = 0; index < value.length; index++) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0
  }

  return seed
}
