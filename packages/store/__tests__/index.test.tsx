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

    const unsub = store.subscribe(subscription)

    store.setState(() => 1);

    expect(store.state).toEqual(1)
    expect(subscription).toHaveBeenCalled()

    unsub();

    store.setState(() => 2);

    expect(store.state).toEqual(2)

    expect(subscription).toHaveBeenCalledTimes(1)
  })

  test(`setState passes previous state`, () => {
    const store = new Store(3);

    store.setState((v) => v + 1);

    expect(store.state).toEqual(4)
  })

  test(`updateFn acts as state transformer`, () => {
    const store = new Store(1, {
      updateFn: v => updater => Number(updater(v))
    });

    store.setState((v) => `${v + 1}` as never);

    expect(store.state).toEqual(2)

    store.setState((v) => `${v + 2}` as never);

    expect(store.state).toEqual(4)

    expect(typeof store.state).toEqual("number")
  })
})
