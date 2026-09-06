type PendingReplayEvent = {
  marker: Element
  targetPath: Array<number>
  type: string
  event: Event
}

export const replayEventsByGateId = /* @__PURE__ */ new Map<
  string,
  Array<PendingReplayEvent>
>()
