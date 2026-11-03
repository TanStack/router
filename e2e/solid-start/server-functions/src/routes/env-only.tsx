import { createFileRoute } from '@tanstack/solid-router'
import {
  createClientOnlyFn,
  createServerFn,
  createServerOnlyFn,
} from '@tanstack/solid-start'
import * as Start from '@tanstack/solid-start'
import { createSignal } from 'solid-js'

const serverEcho = createServerOnlyFn((input: string) => 'server got: ' + input)
const clientEcho = createClientOnlyFn((input: string) => 'client got: ' + input)

const namespaceServerEcho = Start.createServerOnlyFn(
  (input: string) => 'server got: ' + input + ' (NAMESPACE_SERVER_ONLY_BODY)',
)
const namespaceClientEcho = Start.createClientOnlyFn(
  (input: string) => 'client got: ' + input + ' (NAMESPACE_CLIENT_ONLY_BODY)',
)

const testOnServer = createServerFn()
  .inputValidator((namespace: boolean) => namespace)
  .handler(({ data: namespace }) => {
    const serverOnServer = (namespace ? namespaceServerEcho : serverEcho)(
      'hello',
    )
    let clientOnServer: string
    try {
      clientOnServer = (namespace ? namespaceClientEcho : clientEcho)('hello')
    } catch (e) {
      clientOnServer =
        'clientEcho threw an error: ' +
        (e instanceof Error ? e.message : String(e))
    }
    return { serverOnServer, clientOnServer }
  })

export const Route = createFileRoute('/env-only')({
  validateSearch: (search): { namespace?: boolean } => ({
    namespace: search.namespace === true,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()
  const [results, setResults] = createSignal<Partial<Record<string, string>>>()

  async function handleClick() {
    const namespace = search().namespace ?? false
    const { serverOnServer, clientOnServer } = await testOnServer({
      data: namespace,
    })
    const clientOnClient = (namespace ? namespaceClientEcho : clientEcho)(
      'hello',
    )
    let serverOnClient: string
    try {
      serverOnClient = (namespace ? namespaceServerEcho : serverEcho)('hello')
    } catch (e) {
      serverOnClient =
        'serverEcho threw an error: ' +
        (e instanceof Error ? e.message : String(e))
    }
    setResults({
      serverOnServer,
      clientOnServer,
      clientOnClient,
      serverOnClient,
    })
  }

  return (
    <div>
      <button onClick={handleClick} data-testid="test-env-only-results-btn">
        Run
      </button>
      {!!results() && (
        <div>
          <h1>
            <code>serverEcho</code>
          </h1>
          When we called the function on the server:
          <pre data-testid="server-on-server">{results()?.serverOnServer}</pre>
          When we called the function on the client:
          <pre data-testid="server-on-client">{results()?.serverOnClient}</pre>
          <br />
          <h1>
            <code>clientEcho</code>
          </h1>
          When we called the function on the server:
          <pre data-testid="client-on-server">{results()?.clientOnServer}</pre>
          When we called the function on the client:
          <pre data-testid="client-on-client">{results()?.clientOnClient}</pre>
        </div>
      )}
    </div>
  )
}
