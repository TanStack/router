import { normalizeFlowId, type ControlFlowBranch } from '../../shared'

type MarkerProps = {
  branch: ControlFlowBranch
  value: string
  checksum?: number
}

type FlowParams = {
  id: string
}

export function ControlFlowMarker(props: MarkerProps) {
  return (
    <main
      data-control-flow-branch={props.branch}
      data-control-flow-value={props.value}
      data-control-flow-checksum={props.checksum}
    />
  )
}

export function EmptyPage() {
  return null
}

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
