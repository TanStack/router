import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { FederatedMessage } from './message'

function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h1>Remote application</h1>
      <FederatedMessage />
    </main>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
