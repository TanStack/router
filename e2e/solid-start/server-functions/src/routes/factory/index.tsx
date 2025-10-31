import { createFileRoute, deepEqual } from '@tanstack/solid-router'

import { createSignal, For } from 'solid-js'
import { createServerFn } from '@tanstack/solid-start'
import { fooFnInsideFactoryFile } from './-functions/createFooServerFn'
import {
  barFn,
  barFnPOST,
  composedFn,
  fakeFn,
  fooFn,
  fooFnPOST,
  localFn,
  localFnPOST,
} from './-functions/functions'

export const Route = createFileRoute('/factory/')({
  ssr: false,
  component: RouteComponent,
})

const fnInsideRoute = createServerFn({ method: 'GET' }).handler(() => {
  return {
    name: 'fnInsideRoute',
  }
})

const functions = {
  fnInsideRoute: {
    fn: fnInsideRoute,
    type: 'serverFn',
    expected: {
      name: 'fnInsideRoute',
    },
  },
  fooFnInsideFactoryFile: {
    fn: fooFnInsideFactoryFile,
    type: 'serverFn',

    expected: {
      name: 'fooFnInsideFactoryFile',
      context: { foo: 'foo' },
    },
  },
  fooFn: {
    fn: fooFn,
    type: 'serverFn',

    expected: {
      name: 'fooFn',
      context: { foo: 'foo' },
    },
  },
  fooFnPOST: {
    fn: fooFnPOST,
    type: 'serverFn',

    expected: {
      name: 'fooFnPOST',
      context: { foo: 'foo' },
    },
  },
  barFn: {
    fn: barFn,
    type: 'serverFn',

    expected: {
      name: 'barFn',
      context: { foo: 'foo', bar: 'bar' },
    },
  },
  barFnPOST: {
    fn: barFnPOST,
    type: 'serverFn',

    expected: {
      name: 'barFnPOST',
      context: { foo: 'foo', bar: 'bar' },
    },
  },
  localFn: {
    fn: localFn,
    type: 'serverFn',

    expected: {
      name: 'localFn',
      context: { foo: 'foo', bar: 'bar', local: 'local', another: 'another' },
    },
  },
  localFnPOST: {
    fn: localFnPOST,
    type: 'serverFn',

    expected: {
      name: 'localFnPOST',
      context: { foo: 'foo', bar: 'bar', local: 'local', another: 'another' },
    },
  },
  composedFn: {
    fn: composedFn,
    type: 'serverFn',
    expected: {
      name: 'composedFn',
      context: { foo: 'foo', bar: 'bar', another: 'another', local: 'local' },
    },
  },
  fakeFn: {
    fn: fakeFn,
    type: 'localFn',
    expected: {
      name: 'fakeFn',
      window,
    },
  },
} satisfies Record<string, TestCase>

interface TestCase {
  fn: () => Promise<any>
  expected: any
  type: 'serverFn' | 'localFn'
}
function Test(props: TestCase) {
  const [result, setResult] = createSignal<null | unknown>(null)
  function comparison() {
    if (result()) {
      const isEqual = deepEqual(result(), props.expected)
      return isEqual ? 'equal' : 'not equal'
    }
    return 'Loading...'
  }

  return (
    <div
      data-testid={`test-${props.expected.name}`}
      class="p-2 border border-gray-200 rounded-md"
    >
      <h2 class="font-bold text-lg"></h2>
      <div>
        It should return{' '}
        <code>
          <pre data-testid={`expected-fn-result-${props.expected.name}`}>
            {props.type === 'serverFn'
              ? JSON.stringify(props.expected)
              : 'localFn'}
          </pre>
        </code>
      </div>
      <p>
        fn returns:
        <br />
        <span data-testid={`fn-result-${props.expected.name}`}>
          {result()
            ? props.type === 'serverFn'
              ? JSON.stringify(result())
              : 'localFn'
            : 'Loading...'}
        </span>{' '}
        <span data-testid={`fn-comparison-${props.expected.name}`}>
          {comparison()}
        </span>
      </p>
      <button
        data-testid={`btn-fn-${props.expected.name}`}
        type="button"
        class="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        onClick={() => {
          props.fn().then(setResult)
        }}
      >
        Invoke Server Function
      </button>
    </div>
  )
}
function RouteComponent() {
  return (
    <div class="p-2 m-2 grid gap-2" data-testid="factory-route-component">
      <h1 class="font-bold text-lg">Server functions middleware E2E tests</h1>
      <For each={Object.entries(functions)}>
        {([name, testCase]) => <Test {...testCase} />}
      </For>
    </div>
  )
}
