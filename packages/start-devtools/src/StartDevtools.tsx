import { Header, HeaderLogo, JsonTree, MainPanel, Section, SectionTitle} from "@tanstack/devtools-ui"
import { startEventClient } from "@tanstack/start-server-core/event-client"
import { For, createEffect, createSignal,   } from "solid-js"

export default function StartDevtools() {
  const [requests, setRequests] =createSignal<Array<{headers: Headers, url: string, method: string}>>([])

  createEffect(() => {
    startEventClient.on("request-received", (e) => {
    setRequests((r) => [...r, e.payload])
  })
  })
  return (
    <MainPanel>
      <Header> 
        <HeaderLogo flavor={{
          light: "#00bba7 ",
          dark: "#00bba7 "
        }} >
          TanStack Start
        </HeaderLogo>
      </Header>
     <MainPanel withPadding>
      <Section>
        <SectionTitle>
          Incoming Requests: {requests().length}
        </SectionTitle> 
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>URL</th>
              <th>Headers</th>
            </tr>
          </thead>
          <tbody>
            <For each={requests()}>
              {(req) => (
                <tr>
                  <td>{req.method}</td>
                <td>{req.url}</td>
                <td>
                  
                    <JsonTree value={req.headers} />
                   
                </td>
              </tr>
            )}
          </For>
          </tbody>
        </table>
      </Section>
     </MainPanel>
    </MainPanel>
     
  )
}
