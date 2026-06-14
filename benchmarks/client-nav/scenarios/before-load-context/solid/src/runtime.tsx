import { createRenderEffect } from 'solid-js'
import { runContextComputation } from '../../shared'

export const rootSubscribers = Array.from({ length: 4 }, (_, index) => index)
export const middleSubscribers = Array.from({ length: 5 }, (_, index) => index)
export const leafSubscribers = Array.from({ length: 6 }, (_, index) => index)

export function consumeSelectedValue(value: number, label: string) {
  return runContextComputation(value, label, 12)
}

export function PerfValue(props: { value: () => number }) {
  createRenderEffect(() => {
    void props.value()
  })

  return null
}
