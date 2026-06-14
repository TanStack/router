import { createRenderEffect } from 'solid-js'

export function PerfValue(props: { value: () => unknown }) {
  createRenderEffect(() => {
    void props.value()
  })

  return null
}
