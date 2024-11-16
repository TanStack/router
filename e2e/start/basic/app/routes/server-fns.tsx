import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

export const Route = createFileRoute('/server-fns')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <ConsistentServerFnCalls />
      <AllowServerFnReturnNull />
    </>
  )
}

// START CONSISTENT_SERVER_FN_CALLS
const cons_getFn1 = createServerFn()
  .validator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    return { payload: data }
  })

const cons_serverGetFn1 = createServerFn()
  .validator((d: { username: string }) => d)
  .handler(({ data }) => {
    return cons_getFn1({ data })
  })

const cons_postFn1 = createServerFn({ method: 'POST' })
  .validator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    return { payload: data }
  })

const cons_serverPostFn1 = createServerFn({ method: 'POST' })
  .validator((d: { username: string }) => d)
  .handler(({ data }) => {
    return cons_postFn1({ data })
  })

/**
 * This component checks whether the returned payloads from server function
 * are the same, regardless of whether the server function is called directly
 * from the client or from within the server function.
 * @link https://github.com/TanStack/router/issues/1866
 * @link https://github.com/TanStack/router/issues/2481
 */
function ConsistentServerFnCalls() {
  const [getServerResult, setGetServerResult] = React.useState({})
  const [getDirectResult, setGetDirectResult] = React.useState({})

  const [postServerResult, setPostServerResult] = React.useState({})
  const [postDirectResult, setPostDirectResult] = React.useState({})

  return (
    <div className="p-2 border m-2 grid gap-2">
      <h3>Consistent Server Fn GET Calls</h3>
      <p>
        This component checks whether the returned payloads from server function
        are the same, regardless of whether the server function is called
        directly from the client or from within the server function.
      </p>
      <div>
        It should return{' '}
        <code>
          <pre data-testid="expected-consistent-server-fns-result">
            {JSON.stringify({ payload: { username: 'TEST' } })}
          </pre>
        </code>
      </div>
      <p>
        {`GET: cons_getFn1 called from server cons_serverGetFn1 returns`}
        <br />
        <span data-testid="cons_serverGetFn1-response">
          {JSON.stringify(getServerResult)}
        </span>
      </p>
      <p>
        {`GET: cons_getFn1 called directly returns`}
        <br />
        <span data-testid="cons_getFn1-response">
          {JSON.stringify(getDirectResult)}
        </span>
      </p>
      <p>
        {`POST: cons_postFn1 called from cons_serverPostFn1 returns`}
        <br />
        <span data-testid="cons_serverPostFn1-response">
          {JSON.stringify(postServerResult)}
        </span>
      </p>
      <p>
        {`POST: cons_postFn1 called directly returns`}
        <br />
        <span data-testid="cons_postFn1-response">
          {JSON.stringify(postDirectResult)}
        </span>
      </p>
      <button
        data-testid="test-consistent-server-fn-calls-btn"
        type="button"
        className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        onClick={() => {
          // GET calls
          cons_serverGetFn1({ data: { username: 'TEST' } }).then(
            setGetServerResult,
          )
          cons_getFn1({ data: { username: 'TEST' } }).then(setGetDirectResult)

          // POST calls
          cons_serverPostFn1({ data: { username: 'TEST' } }).then(
            setPostServerResult,
          )
          cons_postFn1({ data: { username: 'TEST' } }).then(setPostDirectResult)
        }}
      >
        Test Consistent server function responses
      </button>
    </div>
  )
}

// END CONSISTENT_SERVER_FN_CALLS

// START ALLOW_SERVER_FN_RETURN_NULL

const $allow_return_null_getFn = createServerFn().handler(async () => {
  return null
})
const $allow_return_null_postFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    return null
  },
)

/**
 * This component checks whether the server function can return null
 * without throwing an error.
 * @link https://github.com/TanStack/router/issues/2776
 */
function AllowServerFnReturnNull() {
  const [getServerResult, setGetServerResult] = React.useState<any>({})
  const [postServerResult, setPostServerResult] = React.useState<any>({})

  return (
    <div className="p-2 border m-2 grid gap-2">
      <h3>Allow Server Fn Return Null</h3>
      <p>
        This component checks whether the server function can return null
        without throwing an error.
      </p>
      <div>
        It should return{' '}
        <code>
          <pre>{JSON.stringify(null)}</pre>
        </code>
      </div>
      <p>
        {`GET: $allow_return_null_getFn returns`}
        <br />
        <span data-testid="allow_return_null_getFn-response">
          {JSON.stringify(getServerResult ?? '-')}
        </span>
      </p>
      <p>
        {`POST: $allow_return_null_postFn returns`}
        <br />
        <span data-testid="allow_return_null_postFn-response">
          {JSON.stringify(postServerResult ?? '-')}
        </span>
      </p>
      <button
        data-testid="test-allow-server-fn-return-null-btn"
        type="button"
        className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        onClick={() => {
          $allow_return_null_getFn().then(setGetServerResult)
          $allow_return_null_postFn().then(setPostServerResult)
        }}
      >
        Test Allow Server Fn Return Null
      </button>
    </div>
  )
}

// END ALLOW_SERVER_FN_RETURN_NULL
