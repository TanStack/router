import * as Vue from 'vue'
import { normalizeFlowId, type ControlFlowBranch } from '../../shared'

type MarkerProps = {
  branch: ControlFlowBranch
  value: string
  checksum?: number
}

type FlowParams = {
  id: string
}

export function createControlFlowMarkerElement(props: MarkerProps) {
  return (
    <main
      data-control-flow-branch={props.branch}
      data-control-flow-value={props.value}
      data-control-flow-checksum={props.checksum}
    />
  )
}

export const EmptyPage = Vue.defineComponent({
  setup() {
    return () => null
  },
})

export function parseFlowParams(params: { id: string }) {
  return {
    id: normalizeFlowId(params.id),
  }
}

export function stringifyFlowParams(params: FlowParams) {
  return {
    id: normalizeFlowId(params.id),
  }
}
