import {describe, test, expect, vi} from 'vitest'
import {Store} from "../src/index";

describe('store', () => {
  test(`should set the initial value`, () => {
    const store = new Store(0);

    expect(store.state).toEqual(0)
  })

  test(`basic subscriptions should work`, () => {
    const store = new Store(0);

    const subscription = vi.fn();

    store.subscribe(subscription)

    store.setState(() => 1);

    expect(store.state).toEqual(1)
    expect(subscription).toHaveBeenCalled()
  })

  test(`setState passes previous state`, () => {
    const store = new Store(3);

    store.setState((v) => v + 1);

    expect(store.state).toEqual(4)
  })
})
