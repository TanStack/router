import { createSerializationAdapter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

// The class, its adapter and a server function returning it share one module.
// The adapter is registered in start.tsx, so its `instanceof` test must match
// the instances the server function's handler creates.

export class Money {
  constructor(
    public readonly cents: number,
    public readonly currency: string,
  ) {}

  format() {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`
  }
}

export const moneyAdapter = createSerializationAdapter({
  key: 'money',
  test: (v) => v instanceof Money,
  toSerializable: ({ cents, currency }) => ({ cents, currency }),
  fromSerializable: ({ cents, currency }) => new Money(cents, currency),
})

export const getBudget = createServerFn().handler(
  () => new Money(1_250_000, 'EUR'),
)

export function describeMoney(value: unknown) {
  return value instanceof Money
    ? `Money ${value.format()}`
    : `not a Money: ${JSON.stringify(value)}`
}
