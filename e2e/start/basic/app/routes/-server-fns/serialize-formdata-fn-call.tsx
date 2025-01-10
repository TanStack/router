import * as React from 'react'
import { createServerFn } from '@tanstack/start'

const testValues = {
  name: 'Sean',
  age: 25,
  __adder: 1,
}

export const greetUser = createServerFn()
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) {
      throw new Error('Invalid! FormData is required')
    }
    const name = data.get('name')
    const age = data.get('age')

    if (!name || !age) {
      throw new Error('Name and age are required')
    }

    return {
      name: name.toString(),
      age: parseInt(age.toString(), 10),
    }
  })
  .handler(
    ({ data: { name, age } }) =>
      `Hello, ${name}! You are ${age + testValues.__adder} years old.`,
  )

// Usage
export function SerializeFormDataFnCall() {
  const [formDataResult, setFormDataResult] = React.useState({})

  return (
    <div className="p-2 border m-2 grid gap-2">
      <h3>Serialize FormData Fn POST Call</h3>
      <div className="overflow-y-auto">
        It should return{' '}
        <code>
          <pre data-testid="expected-serialize-formdata-server-fn-result">
            Hello, {testValues.name}! You are{' '}
            {testValues.age + testValues.__adder} years old.
          </pre>
        </code>
      </div>
      <form
        className="flex flex-col gap-2"
        data-testid="serialize-formdata-form"
        onSubmit={(evt) => {
          evt.preventDefault()
          const data = new FormData(evt.currentTarget)
          greetUser({ data }).then(setFormDataResult)
        }}
      >
        <input type="text" name="name" defaultValue={testValues.name} />
        <input type="number" name="age" defaultValue={testValues.age} />
        <button
          type="submit"
          data-testid="test-serialize-formdata-fn-calls-btn"
          className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Submit
        </button>
      </form>
      <div className="overflow-y-auto">
        <pre data-testid="serialize-formdata-form-response">
          {JSON.stringify(formDataResult)}
        </pre>
      </div>
    </div>
  )
}
