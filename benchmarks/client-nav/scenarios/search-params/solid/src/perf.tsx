import { createRenderEffect } from 'solid-js'
import { computeSearchChecksum } from '../../shared'

export function PerfValue(props: { value: () => unknown }) {
  createRenderEffect(() => {
    void computeSearchChecksum(props.value())
  })

  return null
}
