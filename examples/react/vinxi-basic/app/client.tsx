/// <reference types="vinxi/types/client" />
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import 'vinxi/client'

import App from './app'

const rootElement = document.getElementById('root')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
