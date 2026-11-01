import { createSerializationAdapter } from '@tanstack/react-router'

/** An amount of money. Server functions and loaders return it as is. */
export class Money {
  constructor(
    readonly cents: number,
    readonly currency: string,
  ) {}

  format() {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`
  }
}

export const moneyAdapter = createSerializationAdapter({
  key: 'catalog-money',
  test: (value): value is Money => value instanceof Money,
  toSerializable: (money) => ({ cents: money.cents, currency: money.currency }),
  fromSerializable: (value) => new Money(value.cents, value.currency),
})
