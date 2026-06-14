import { runContextComputation } from '../../shared'

export const rootSubscribers = Array.from({ length: 4 }, (_, index) => index)
export const middleSubscribers = Array.from({ length: 5 }, (_, index) => index)
export const leafSubscribers = Array.from({ length: 6 }, (_, index) => index)

export function consumeSelectedValue(value: number, label: string) {
  void runContextComputation(value, label, 12)
}
