import { createSerializationAdapter } from '@tanstack/vue-router'

export class Foo {
  constructor(public value: string) {}
}

export interface Car {
  __type: 'car'
  make: string
  model: string
  year: number
  honk: () => { message: string; make: string; model: string; year: number }
}

export function makeCar(opts: {
  make: string
  model: string
  year: number
}): Car {
  return {
    ...opts,
    __type: 'car',
    honk: () => {
      return { message: `Honk! Honk!`, ...opts }
    },
  }
}

export const fooAdapter = createSerializationAdapter({
  key: 'foo',
  test: (value: any) => value instanceof Foo,
  toSerializable: (foo) => foo.value,
  fromSerializable: (value) => new Foo(value),
})

export const carAdapter = createSerializationAdapter({
  key: 'car',
  test: (value: any): value is Car =>
    '__type' in (value as Car) && value.__type === 'car',
  toSerializable: (car) => ({
    make: car.make,
    model: car.model,
    year: car.year,
  }),
  fromSerializable: (value: { make: string; model: string; year: number }) =>
    makeCar(value),
})

export class AsyncFoo {
  private readonly internalValue: string
  constructor(value: string) {
    this.internalValue = value
  }

  get valueAsync() {
    return new Promise<[string]>((resolve) => {
      setTimeout(() => {
        resolve([this.internalValue])
      }, 1000)
    })
  }

  get value() {
    return this.internalValue
  }

  public echo() {
    return { message: `echo`, value: this.internalValue }
  }
}

export const asyncFooAdapter = createSerializationAdapter({
  key: 'asyncFoo',
  test: (value) => value instanceof AsyncFoo,
  toSerializable: (foo) => foo.value,
  toSerializableAsync: (foo) => foo.valueAsync,
  fromSerializable: (value) =>
    new AsyncFoo(typeof value === 'string' ? value : value[0]),
})

export interface AsyncCar {
  __type: 'asynccar'
  make: string
  model: string
  year: number
  honk: () => { message: string; make: string; model: string; year: number }
}

export function makeAsyncCar(opts: {
  make: string
  model: string
  year: number
}): AsyncCar {
  return {
    ...opts,
    __type: 'asynccar',
    honk: () => {
      return { message: `Asynchronous Car Honk!`, ...opts }
    },
  }
}

export const asyncCarAdapter = createSerializationAdapter({
  key: 'asyncCar',
  test: (value: any): value is AsyncCar =>
    '__type' in (value as AsyncCar) && value.__type === 'asynccar',
  toSerializable: (car) => ({
    make: car.make,
    model: car.model,
    year: car.year,
  }),
  fromSerializable: (value: { make: string; model: string; year: number }) =>
    makeAsyncCar(value),
})

export function makeAsyncFoo(suffix: string = '') {
  return new AsyncFoo(
    (typeof window === 'undefined' ? 'server' : 'client') + '-async' + suffix,
  )
}

export function makeFoo(suffix: string = '') {
  return new Foo(typeof window === 'undefined' ? 'server' : 'client' + suffix)
}

export function makeData() {
  return {
    asyncFoo: {
      singleInstance: makeAsyncFoo(),
    },
    asyncCar: {
      singleInstance: makeAsyncCar({
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
      }),
    },
    foo: {
      singleInstance: makeFoo(),
      array: [makeFoo('0'), makeFoo('1'), makeFoo('2')],
      map: new Map([
        [0, makeFoo('0')],
        [1, makeFoo('1')],
        [2, makeFoo('2')],
      ]),
      mapOfArrays: new Map([
        [0, [makeFoo('0-a'), makeFoo('0-b')]],
        [1, [makeFoo('1-a'), makeFoo('1-b')]],
        [2, [makeFoo('2-a'), makeFoo('2-b')]],
      ]),
    },
    car: {
      singleInstance: makeCar({
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
      }),
      array: [
        makeCar({ make: 'Honda', model: 'Accord', year: 2019 }),
        makeCar({ make: 'Ford', model: 'Mustang', year: 2021 }),
      ],
      map: new Map([
        [0, makeCar({ make: 'Chevrolet', model: 'Malibu', year: 2018 })],
        [1, makeCar({ make: 'Nissan', model: 'Altima', year: 2020 })],
        [2, makeCar({ make: 'Hyundai', model: 'Sonata', year: 2021 })],
      ]),
      mapOfArrays: new Map([
        [0, [makeCar({ make: 'Kia', model: 'Optima', year: 2019 })]],
        [1, [makeCar({ make: 'Subaru', model: 'Legacy', year: 2020 })]],
        [2, [makeCar({ make: 'Volkswagen', model: 'Passat', year: 2021 })]],
      ]),
    },
  }
}
export class NestedOuter {
  constructor(public inner: NestedInner) {}
  whisper() {
    return this.inner.value.toLowerCase()
  }
}

export class NestedInner {
  constructor(public value: string) {}
  shout() {
    return this.value.toUpperCase()
  }
}

export const nestedInnerAdapter = createSerializationAdapter({
  key: 'nestedInner',
  test: (value): value is NestedInner => value instanceof NestedInner,
  toSerializable: (inner) => inner.value,
  fromSerializable: (value) => new NestedInner(value),
})

export const nestedOuterAdapter = createSerializationAdapter({
  key: 'nestedOuter',
  extends: [nestedInnerAdapter],
  test: (value) => value instanceof NestedOuter,
  toSerializable: (outer) => outer.inner,
  fromSerializable: (value) => new NestedOuter(value),
})

export function makeNested() {
  return new NestedOuter(new NestedInner('Hello World'))
}

export function RenderData({
  id,
  data,
}: {
  id: string
  data: ReturnType<typeof makeData>
}) {
  const localData = makeData()
  return (
    <div data-testid={`${id}-container`}>
      <h3>Car</h3>
      <h4>expected</h4>
      <div data-testid={`${id}-car-expected`}>
        {JSON.stringify({
          make: localData.car.singleInstance.make,
          model: localData.car.singleInstance.model,
          year: localData.car.singleInstance.year,
        })}
      </div>
      <h4>actual</h4>
      <div data-testid={`${id}-car-actual`}>
        {JSON.stringify({
          make: data.car.singleInstance.make,
          model: data.car.singleInstance.model,
          year: data.car.singleInstance.year,
        })}
      </div>
      <h3>Async Car</h3>
      <h4>expected</h4>
      <div data-testid={`${id}-async-car-expected`}>
        {JSON.stringify({
          make: localData.asyncCar.singleInstance.make,
          model: localData.asyncCar.singleInstance.model,
          year: localData.asyncCar.singleInstance.year,
        })}
      </div>
      <h4>actual</h4>
      <div data-testid={`${id}-async-car-actual`}>
        {JSON.stringify({
          make: data.asyncCar.singleInstance.make,
          model: data.asyncCar.singleInstance.model,
          year: data.asyncCar.singleInstance.year,
        })}
      </div>
      <b>Foo</b>
      <div data-testid={`${id}-foo`}>
        {JSON.stringify({
          value: data.foo.singleInstance.value,
        })}
      </div>
      <b>Async Foo</b>
      <div data-testid={`${id}-async-foo`}>
        {JSON.stringify({
          value: data.asyncFoo.singleInstance.value,
        })}
      </div>
    </div>
  )
}

export function RenderNestedData({ nested }: { nested: NestedOuter }) {
  {
    const localData = makeNested()
    const expectedShoutState = localData.inner.shout()
    const expectedWhisperState = localData.whisper()
    const shoutState = nested.inner.shout()
    const whisperState = nested.whisper()

    return (
      <div data-testid="data-only-container">
        <h2 data-testid="data-only-heading">data-only</h2>
        <div data-testid="shout-container">
          <h3>shout</h3>
          <div>
            expected:{' '}
            <div data-testid="shout-expected-state">
              {JSON.stringify(expectedShoutState)}
            </div>
          </div>
          <div>
            actual:{' '}
            <div data-testid="shout-actual-state">
              {JSON.stringify(shoutState)}
            </div>
          </div>
        </div>
        <div data-testid="whisper-container">
          <h3>whisper</h3>
          <div>
            expected:{' '}
            <div data-testid="whisper-expected-state">
              {JSON.stringify(expectedWhisperState)}
            </div>
          </div>
          <div>
            actual:{' '}
            <div data-testid="whisper-actual-state">
              {JSON.stringify(whisperState)}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
