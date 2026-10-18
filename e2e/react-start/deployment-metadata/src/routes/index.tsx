import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { readCarrierGet, readCarrierPost } from '~/serverFns'
import logoUrl from '~/assets/logo.svg'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [post, setPost] = React.useState('')
  const [get, setGet] = React.useState('')
  const [echo, setEcho] = React.useState('')
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <div>
      <h1>Deployment metadata</h1>
      {hydrated ? <span data-testid="hydrated" /> : null}

      <div className="css-url-asset" data-testid="css-url-asset" />

      <img src={logoUrl} alt="" data-testid="js-asset" />

      <button
        data-testid="call-post"
        onClick={async () => setPost(await readCarrierPost())}
      >
        POST server function
      </button>
      <span data-testid="result-post">{post}</span>

      <button
        data-testid="call-get"
        onClick={async () => setGet(await readCarrierGet({ data: { id: 1 } }))}
      >
        GET server function
      </button>
      <span data-testid="result-get">{get}</span>

      <button
        data-testid="call-user-fetch"
        onClick={async () => {
          const response = await fetch('/api/user-fetch')
          setEcho(await response.text())
        }}
      >
        Plain fetch
      </button>
      <span data-testid="result-user-fetch">{echo}</span>
    </div>
  )
}
